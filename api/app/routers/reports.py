import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.report import Report
from app.models.assessment import Assessment
from app.models.finding import Finding
from app.models.feature import Feature
from app.models.audit_log import AuditLog
from app.schemas.report import ReportCreate, ReportOut, DoctorReviewSubmit
from app.services.late_fusion import late_fusion
from app.services.clinical_rules import clinical_rules

router = APIRouter(prefix="/reports", tags=["Reports"])

@router.get("", response_model=List[ReportOut])
def list_reports(patient_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Report)
    if patient_id:
        query = query.filter(Report.patient_id == patient_id)
    reports = query.order_by(Report.created_at.desc()).all()
    out = []
    for r in reports:
        findings = db.query(Finding).filter(Finding.assessment_id == r.assessment_id).all()
        features = db.query(Feature).filter(Feature.assessment_id == r.assessment_id).all()
        r_dict = ReportOut.model_validate(r)
        r_dict.findings = findings
        r_dict.features = features
        out.append(r_dict)
    return out

@router.get("/{report_id}", response_model=ReportOut)
def get_report(report_id: str, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    findings = db.query(Finding).filter(Finding.assessment_id == report.assessment_id).all()
    features = db.query(Feature).filter(Feature.assessment_id == report.assessment_id).all()
    
    report_dict = ReportOut.from_orm(report) if hasattr(ReportOut, "from_orm") else ReportOut.model_validate(report)
    report_dict.findings = findings
    report_dict.features = features
    return report_dict

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
    feature_list = [{"feature_name": f.feature_name, "value": f.value} for f in features]

    # Emergency FAST check
    fast_result = clinical_rules.check_emergency_fast(feature_map)

    # Late Fusion scoring & explainable pattern analysis
    quality_status = "valid" if assessment.quality_gate_passed else "limited"
    fusion_result = late_fusion.calculate_multimodal_assessment(
        features=feature_list,
        quality_status=quality_status
    )

    summary_text = (
        f"Contactless multimodal evaluation completed. "
        f"Quality gate status: {'Passed' if assessment.quality_gate_passed else 'Flagged'}. "
        f"Status: {fusion_result.get('overall_status', 'No flag')}. "
        f"{fusion_result.get('summary', '')} "
        f"{'CRITICAL: Emergency FAST criteria met.' if fast_result['emergency_triggered'] else ''}"
    ).strip()

    existing_report = db.query(Report).filter(Report.assessment_id == assessment_id).first()
    if existing_report:
        report = existing_report
        report.summary_text = summary_text
        report.overall_status = fusion_result.get("overall_status", "No flag")
        report.late_fusion_score = fusion_result.get("composite_deviation_score")
        report.domain_scores_json = json.dumps(fusion_result.get("domain_scores", {}))
        report.emergency_fast_triggered = fast_result["emergency_triggered"]
        report.emergency_details = fast_result.get("details")
        report.explainability_notes = json.dumps(fusion_result.get("patterns", []))
        report.is_simulated = assessment.is_simulated
    else:
        report = Report(
            assessment_id=assessment_id,
            patient_id=assessment.patient_id,
            summary_text=summary_text,
            overall_status=fusion_result.get("overall_status", "No flag"),
            late_fusion_score=fusion_result.get("composite_deviation_score"),
            domain_scores_json=json.dumps(fusion_result.get("domain_scores", {})),
            emergency_fast_triggered=fast_result["emergency_triggered"],
            emergency_details=fast_result.get("details"),
            explainability_notes=json.dumps(fusion_result.get("patterns", [])),
            is_simulated=assessment.is_simulated
        )
        db.add(report)

    # Sync Findings based on detected explainable patterns
    db.query(Finding).filter(Finding.assessment_id == assessment_id).delete()
    for p in fusion_result.get("patterns", []):
        domains = p.get("domains", [])
        domain_tag = "composite" if len(domains) > 1 else (domains[0] if domains else "motor")
        finding = Finding(
            assessment_id=assessment_id,
            domain=domain_tag,
            finding_title=p["title"],
            explanation=p["explanation"],
            evidence_metrics=json.dumps({
                "rule_id": p["rule_id"],
                "triggering_features": p["triggering_features"],
                "actual_values": p["actual_values"],
                "reference_values": p["reference_values"],
                "quality": p["quality"]
            }),
            clinical_relevance="Observed behavioral deviation - Review advised" if fusion_result["overall_status"] == "Review advised" else "Monitoring change noted",
            requires_review=fusion_result["overall_status"] in ["Watch", "Review advised"],
            status="unreviewed"
        )
        db.add(finding)

    # Add FAST finding if triggered
    if fast_result["emergency_triggered"]:
        fast_finding = Finding(
            assessment_id=assessment_id,
            domain="emergency_alert",
            finding_title="EMERGENCY ALERT: Potential Acute Asymmetry / Speech Impairment (FAST Protocol)",
            explanation="Severe acute asymmetry or speech deviation detected exceeding emergency thresholds. Immediate clinical evaluation recommended.",
            evidence_metrics=fast_result.get("details", "{}"),
            clinical_relevance="CRITICAL: Emergency FAST threshold exceeded",
            requires_review=True,
            status="unreviewed"
        )
        db.add(fast_finding)

    db.commit()
    db.refresh(report)

    findings = db.query(Finding).filter(Finding.assessment_id == assessment_id).all()
    report_dict = ReportOut.from_orm(report) if hasattr(ReportOut, "from_orm") else ReportOut.model_validate(report)
    report_dict.findings = findings
    report_dict.features = features
    return report_dict

@router.post("/{report_id}/approve", response_model=ReportOut)
def approve_report(report_id: str, doctor_user_id: Optional[str] = None, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.approved_by_doctor = True
    report.approved_by_user_id = doctor_user_id
    report.doctor_feedback = "agree"
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

    findings = db.query(Finding).filter(Finding.assessment_id == report.assessment_id).all()
    features = db.query(Feature).filter(Feature.assessment_id == report.assessment_id).all()
    report_dict = ReportOut.from_orm(report) if hasattr(ReportOut, "from_orm") else ReportOut.model_validate(report)
    report_dict.findings = findings
    report_dict.features = features
    return report_dict

@router.post("/{report_id}/review", response_model=ReportOut)
def review_report(report_id: str, review: DoctorReviewSubmit, db: Session = Depends(get_db)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    if review.feedback not in ["agree", "disagree", "unsure"]:
        raise HTTPException(status_code=400, detail="Invalid feedback. Must be 'agree', 'disagree', or 'unsure'.")

    report.doctor_feedback = review.feedback
    report.doctor_notes = review.notes
    report.approved_by_doctor = (review.feedback == "agree")
    report.approved_by_user_id = review.doctor_user_id
    db.commit()
    db.refresh(report)

    audit = AuditLog(
        user_id=review.doctor_user_id,
        action="REVIEW_REPORT",
        target_entity="Report",
        target_id=report.id,
        details=f"Clinician review feedback: {review.feedback}. Notes: {review.notes or 'None'}"
    )
    db.add(audit)
    db.commit()

    findings = db.query(Finding).filter(Finding.assessment_id == report.assessment_id).all()
    features = db.query(Feature).filter(Feature.assessment_id == report.assessment_id).all()
    report_dict = ReportOut.from_orm(report) if hasattr(ReportOut, "from_orm") else ReportOut.model_validate(report)
    report_dict.findings = findings
    report_dict.features = features
    return report_dict
