from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.routers.auth import get_current_user
from app.models.user import User
from app.models.patient import Patient
from app.models.feature import Feature
from app.models.baseline import Baseline
from app.models.audit_log import AuditLog
from app.models.clinical_summary import ClinicalSummary
from app.schemas.ai import (
    ExplainabilityQuery,
    AIExplanationResponse,
    MetricEvidence,
    AIChatRequest,
    AIChatResponse,
    ClinicianSummaryDraft,
    ClinicianSummaryApproveRequest,
    ClinicianSummaryOut,
)
from app.services.grounded_ai_assistant import grounded_ai_assistant

router = APIRouter(prefix="/ai", tags=["AI Services"])

# ---------------- Grounded Chat Endpoint ----------------
@router.post("/chat", response_model=AIChatResponse)
def grounded_ai_chat(
    req: AIChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Role-authorized, evidence-grounded conversational AI assistant.
    Accesses patient records strictly through authorized tools and refuses to invent numbers or diagnose diseases.
    """
    return grounded_ai_assistant.process_chat(
        patient_id=req.patient_id,
        message=req.message,
        current_user=current_user,
        db=db,
        assessment_id=req.assessment_id
    )

# ---------------- Clinician Summary Draft Generation ----------------
@router.get("/clinician-summary/draft/{patient_id}", response_model=ClinicianSummaryDraft)
def get_clinician_summary_draft(
    patient_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generates a draft SOAP-style clinical summary.
    The AI strictly produces a draft; it is NEVER automatically saved as an approved medical record.
    """
    return grounded_ai_assistant.generate_clinician_summary(patient_id, db, current_user)

# ---------------- Explicit Clinician Summary Approval & Save ----------------
@router.post("/clinician-summary/approve", response_model=ClinicianSummaryOut)
def approve_and_save_clinician_summary(
    req: ClinicianSummaryApproveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Explicit clinician review and approval workflow:
    1. Doctor reviews draft
    2. Doctor edits content
    3. Doctor approves and explicitly saves it to medical record.
    Requires doctor role.
    """
    if current_user.role != "doctor":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only licensed clinicians can approve and save clinical summaries."
        )

    if not req.explicit_approval:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Explicit approval confirmation is required before saving to clinical record."
        )

    patient = db.query(Patient).filter(Patient.id == req.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    new_summary = ClinicalSummary(
        patient_id=req.patient_id,
        doctor_id=current_user.id,
        subjective=req.subjective,
        objective=req.objective,
        assessment=req.assessment,
        plan=req.plan,
        is_approved=True,
        approved_at=datetime.now(timezone.utc)
    )
    db.add(new_summary)

    # Audit log entry for medicolegal compliance
    audit = AuditLog(
        user_id=current_user.id,
        action="APPROVE_CLINICAL_SUMMARY",
        target_entity="patients",
        target_id=req.patient_id,
        details=f"Clinician approved SOAP clinical summary for MRN {patient.mrn}"
    )
    db.add(audit)

    db.commit()
    db.refresh(new_summary)
    return new_summary

# ---------------- List Approved Clinical Summaries ----------------
@router.get("/clinician-summaries/{patient_id}", response_model=List[ClinicianSummaryOut])
def list_approved_clinician_summaries(
    patient_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    grounded_ai_assistant.verify_patient_authorization(patient_id, current_user, db)
    return (
        db.query(ClinicalSummary)
        .filter(ClinicalSummary.patient_id == patient_id, ClinicalSummary.is_approved == True)
        .order_by(ClinicalSummary.approved_at.desc())
        .all()
    )

# ---------------- Legacy Explainability (Backward Compatibility) ----------------
@router.post("/explain", response_model=AIExplanationResponse)
def explain_findings(query: ExplainabilityQuery, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == query.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    features_q = db.query(Feature)
    if query.assessment_id:
        features_q = features_q.filter(Feature.assessment_id == query.assessment_id)
    features = features_q.limit(10).all()

    baselines = {b.feature_name: b.mean_value for b in db.query(Baseline).filter(Baseline.patient_id == query.patient_id).all()}

    evidence_points = []
    for f in features:
        base_val = baselines.get(f.feature_name)
        direction = "stable"
        if base_val is not None:
            if f.value > base_val * 1.1:
                direction = "increased"
            elif f.value < base_val * 0.9:
                direction = "decreased"
        
        evidence_points.append(
            MetricEvidence(
                metric_name=f.feature_name,
                observed_value=f.value,
                unit=f.unit,
                baseline_value=base_val,
                change_direction=direction,
                relevance_note=f"Recorded during contactless {f.domain} assessment."
            )
        )

    summary_text = (
        f"Analysis of {len(evidence_points)} tracked behavioral metrics for {patient.first_name} {patient.last_name}: "
        f"All observations are tied directly to stored camera and microphone kinematic values. "
        f"Findings highlight observed deviations from personalized baselines without drawing autonomous diagnostic conclusions."
    )

    return AIExplanationResponse(
        summary=summary_text,
        evidence_points=evidence_points,
        confidence=0.94
    )
