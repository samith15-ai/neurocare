from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.assessment import Assessment
from app.models.patient import Patient
from app.models.audit_log import AuditLog
from app.schemas.assessment import AssessmentCreate, AssessmentOut, QualityCheckResult
from app.services.clinical_rules import clinical_rules

router = APIRouter(prefix="/assessments", tags=["Assessments"])

@router.post("/quality-check", response_model=QualityCheckResult)
def verify_recording_quality(
    luma: float = 50.0,
    face_confidence: float = 0.85,
    posture_confidence: float = 0.80,
    audio_snr_db: float = 22.0
):
    result = clinical_rules.check_quality_gate(
        luma=luma,
        face_confidence=face_confidence,
        posture_confidence=posture_confidence,
        audio_snr_db=audio_snr_db
    )
    return QualityCheckResult(
        passed=result["passed"],
        lighting_ok=result["lighting_ok"],
        framing_ok=result["face_ok"] and result["posture_ok"],
        audio_snr_ok=result["audio_ok"],
        rejection_code=result.get("rejection_code"),
        guidance=result.get("guidance")
    )

@router.get("", response_model=List[AssessmentOut])
def list_assessments(patient_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Assessment)
    if patient_id:
        query = query.filter(Assessment.patient_id == patient_id)
    return query.order_by(Assessment.started_at.desc()).all()

@router.post("", response_model=AssessmentOut, status_code=status.HTTP_201_CREATED)
def start_assessment(assessment_in: AssessmentCreate, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == assessment_in.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    status_str = "completed" if assessment_in.quality_gate_passed else "rejected_quality"
    completed_time = datetime.now(timezone.utc) if assessment_in.quality_gate_passed else None

    assessment = Assessment(
        patient_id=assessment_in.patient_id,
        assessment_type=assessment_in.assessment_type,
        status=status_str,
        quality_gate_passed=assessment_in.quality_gate_passed,
        quality_notes=assessment_in.quality_notes,
        is_simulated=assessment_in.is_simulated,
        completed_at=completed_time
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    audit = AuditLog(
        action="START_ASSESSMENT",
        target_entity="Assessment",
        target_id=assessment.id,
        details=f"Assessment type {assessment.assessment_type} for patient {patient.mrn}"
    )
    db.add(audit)
    db.commit()

    return assessment

@router.get("/{assessment_id}", response_model=AssessmentOut)
def get_assessment(assessment_id: str, db: Session = Depends(get_db)):
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return assessment
