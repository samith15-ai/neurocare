from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.report import Report
from app.models.assessment import Assessment
from app.models.finding import Finding
from app.models.feature import Feature
from app.models.audit_log import AuditLog
from app.schemas.report import ReportCreate, ReportOut
from app.services.late_fusion import late_fusion
from app.services.clinical_rules import clinical_rules

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("", response_model=List[ReportOut])
def list_reports(patient_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Report)
    if patient_id:
        query = query.filter(Report.patient_id == patient_id)
    return query.order_by(Report.created_at.desc()).all()

@router.get("/assessment/{assessment_id}", response_model=ReportOut)
def get_report_by_assessment(assessment_id: str, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.assessment_id == assessment_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found for this assessment")
    
    findings = db.query(Finding).filter(Finding.assessment_id == assessment_id).all()
    features = db.query(Feature).filter(Feature.assessment_id == assessment_id).all()
    
    report_dict = ReportOut.from_orm(report) if hasattr(ReportOut, "from_orm") else ReportOut.model_validate(report)
    report_dict.findings = findings
    report_dict.features = features
    return report_dict

@router.post("/generate/{assessment_id}", response_model=ReportOut)
def generate_report(assessment_id: str, db: Session = Depends(get_db)):
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    features = db.query(Feature).filter(Feature.assessment_id == assessment_id).all()
    feature_map = {f.feature_name: f.value for f in features}

    # Emergency FAST check
    fast_result = clinical_rules.check_emergency_fast(feature_map)

    # Late Fusion
    fusion_result = late_fusion.calculate_multimodal_index(
        facial_deviation=feature_map.get("facial_asymmetry_ratio", 0.1),
        motor_deviation=feature_map.get("finger_tap_decay_ratio", 0.1),
        vocal_deviation=feature_map.get("vocal_jitter_percent", 0.8)
    )

    summary_text = (
        f"Contactless multimodal evaluation completed. "
        f"Quality gate status: {'Passed' if assessment.quality_gate_passed else 'Flagged'}. "
        f"Status: {fusion_result['status_label']}. "
        f"{'CRITICAL: Emergency FAST criteria met.' if fast_result['emergency_triggered'] else ''}"
    )

    existing_report = db.query(Report).filter(Report.assessment_id == assessment_id).first()
    if existing_report:
        report = existing_report
        report.summary_text = summary_text
        report.late_fusion_score = fusion_result.get("composite_deviation_score")
        report.emergency_fast_triggered = fast_result["emergency_triggered"]
        report.emergency_details = fast_result.get("details")
        report.is_simulated = assessment.is_simulated
    else:
        report = Report(
            assessment_id=assessment_id,
            patient_id=assessment.patient_id,
            summary_text=summary_text,
            late_fusion_score=fusion_result.get("composite_deviation_score"),
            emergency_fast_triggered=fast_result["emergency_triggered"],
            emergency_details=fast_result.get("details"),
            explainability_notes=fusion_result.get("traceability"),
            is_simulated=assessment.is_simulated
        )
        db.add(report)

    db.commit()
    db.refresh(report)
    return report

@router.post("/{report_id}/approve", response_model=ReportOut)
def approve_report(report_id: str, doctor_user_id: Optional[str] = None, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.approved_by_doctor = True
    report.approved_by_user_id = doctor_user_id
    db.commit()
    db.refresh(report)

    audit = AuditLog(
        user_id=doctor_user_id,
        action="APPROVE_REPORT",
        target_entity="Report",
        target_id=report.id,
        details=f"Clinician approved report for assessment {report.assessment_id}"
    )
    db.add(audit)
    db.commit()

    return report
