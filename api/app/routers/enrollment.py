import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_password_hash, create_access_token
from app.models.user import User
from app.models.patient import Patient
from app.models.invitation import Invitation
from app.models.consent import PatientConsent
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.audit_log import AuditLog
from app.schemas.invitation import InvitationCreate, InvitationOut, RegisterWithInvite
from app.schemas.consent import ConsentCreate, ConsentRevoke, ConsentOut
from app.schemas.auth import Token

router = APIRouter(prefix="/enrollment", tags=["Enrollment & Consent"])

@router.post("/invitations", response_model=InvitationOut, status_code=status.HTTP_201_CREATED)
def create_invitation(
    invite_in: InvitationCreate,
    doctor_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Doctor creates an enrollment invitation code and QR link for a patient."""
    # Find doctor user or fallback to first doctor
    doctor = None
    if doctor_id:
        doctor = db.query(User).filter(User.id == doctor_id).first()
    if not doctor:
        doctor = db.query(User).filter(User.role == "doctor").first()
    if not doctor:
        raise HTTPException(status_code=400, detail="No doctor found to issue invitation")

    # Generate distinct 8-character uppercase code
    code = f"INV-{secrets.token_hex(4).upper()}"
    expires_at = datetime.now(timezone.utc) + timedelta(days=invite_in.expires_in_days)

    invitation = Invitation(
        code=code,
        doctor_id=doctor.id,
        patient_id=invite_in.patient_id,
        patient_email=invite_in.patient_email,
        expires_at=expires_at,
        status="pending"
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)

    # Log audit
    audit = AuditLog(
        action="CREATE_INVITATION",
        user_id=doctor.id,
        target_entity="Invitation",
        target_id=invitation.id,
        details=f"Generated patient invite {code} (expires in {invite_in.expires_in_days} days)"
    )
    db.add(audit)
    db.commit()

    invitation_dict = InvitationOut.model_validate(invitation)
    invitation_dict.invite_url = f"/enroll?code={code}"
    return invitation_dict

@router.get("/invitations/{code}", response_model=InvitationOut)
def get_invitation(code: str, db: Session = Depends(get_db)):
    """Validate invite code and return invitation status."""
    invitation = db.query(Invitation).filter(Invitation.code == code.upper()).first()
    if not invitation:
        raise HTTPException(status_code=404, detail="Invitation code not found")
    
    # Check expiration
    if invitation.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        invitation.status = "expired"
        db.commit()
        raise HTTPException(status_code=400, detail="Invitation code has expired")

    if invitation.status != "pending":
        raise HTTPException(status_code=400, detail=f"Invitation code is already {invitation.status}")

    invitation_dict = InvitationOut.model_validate(invitation)
    invitation_dict.invite_url = f"/enroll?code={invitation.code}"
    return invitation_dict

@router.post("/register-with-invite", status_code=status.HTTP_201_CREATED)
def register_with_invite(req: RegisterWithInvite, db: Session = Depends(get_db)):
    """Patient registers using invite code, creating User, Patient profile, and recording Consent."""
    # 1. Validate invite
    invitation = db.query(Invitation).filter(Invitation.code == req.invite_code.upper()).first()
    if not invitation or invitation.status != "pending":
        raise HTTPException(status_code=400, detail="Invalid or expired invitation code")

    # 2. Check if user email already exists
    existing_user = db.query(User).filter(User.email == req.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    # 3. Create User
    new_user = User(
        email=req.email,
        hashed_password=get_password_hash(req.password),
        full_name=f"{req.first_name} {req.last_name}",
        role="patient",
        is_active=True
    )
    db.add(new_user)
    db.flush()

    # 4. Check or create Patient profile
    patient = None
    if invitation.patient_id:
        patient = db.query(Patient).filter(Patient.id == invitation.patient_id).first()
        if patient:
            patient.user_id = new_user.id
            patient.first_name = req.first_name
            patient.last_name = req.last_name
            patient.date_of_birth = req.date_of_birth
            patient.gender = req.gender
            if req.primary_condition_notes:
                patient.primary_condition_notes = req.primary_condition_notes

    if not patient:
        mrn_val = req.mrn or f"MRN-{secrets.token_hex(3).upper()}"
        patient = Patient(
            user_id=new_user.id,
            mrn=mrn_val,
            first_name=req.first_name,
            last_name=req.last_name,
            date_of_birth=req.date_of_birth,
            gender=req.gender,
            primary_condition_notes=req.primary_condition_notes
        )
        db.add(patient)
        db.flush()

    # 5. Record Initial Consent
    consent = PatientConsent(
        patient_id=patient.id,
        consent_version=req.consent_version,
        consent_features=req.consent_features,
        consent_evidence_clips=req.consent_evidence_clips,
        consent_research=req.consent_research,
        signature_name=req.signature_name,
        is_revoked=False
    )
    db.add(consent)

    # 6. Mark invitation accepted
    invitation.status = "accepted"
    invitation.accepted_at = datetime.now(timezone.utc)
    invitation.patient_id = patient.id

    # 7. Audit log
    audit = AuditLog(
        action="PATIENT_ENROLLMENT",
        user_id=new_user.id,
        target_entity="Patient",
        target_id=patient.id,
        details=f"Enrolled via invite {invitation.code}. Consent version {req.consent_version} recorded. Evidence clips consented: {req.consent_evidence_clips}."
    )
    db.add(audit)
    db.commit()

    # Generate JWT token
    token = create_access_token(subject=new_user.id, role=new_user.role)

    return {
        "access_token": token,
        "token_type": "bearer",
        "user_id": new_user.id,
        "patient_id": patient.id,
        "full_name": new_user.full_name,
        "role": new_user.role,
        "consent": {
            "version": consent.consent_version,
            "features": consent.consent_features,
            "evidence_clips": consent.consent_evidence_clips,
            "signed_at": consent.signed_at.isoformat()
        }
    }

@router.get("/consent/{patient_id}", response_model=ConsentOut)
def get_patient_consent(patient_id: str, db: Session = Depends(get_db)):
    """Retrieve the latest active consent record for a patient."""
    consent = db.query(PatientConsent).filter(
        PatientConsent.patient_id == patient_id
    ).order_by(PatientConsent.signed_at.desc()).first()

    if not consent:
        raise HTTPException(status_code=404, detail="No consent record found for patient")
    return consent

@router.post("/consent", response_model=ConsentOut)
def record_consent(consent_in: ConsentCreate, db: Session = Depends(get_db)):
    """Record an updated consent agreement."""
    patient = db.query(Patient).filter(Patient.id == consent_in.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    new_consent = PatientConsent(
        patient_id=consent_in.patient_id,
        consent_version=consent_in.consent_version,
        consent_features=consent_in.consent_features,
        consent_evidence_clips=consent_in.consent_evidence_clips,
        consent_research=consent_in.consent_research,
        signature_name=consent_in.signature_name,
        is_revoked=False
    )
    db.add(new_consent)
    db.commit()
    db.refresh(new_consent)

    audit = AuditLog(
        action="UPDATE_CONSENT",
        target_entity="Patient",
        target_id=patient.id,
        details=f"Consent updated to version {consent_in.consent_version}. Clips: {consent_in.consent_evidence_clips}."
    )
    db.add(audit)
    db.commit()

    return new_consent

@router.post("/consent/revoke", response_model=ConsentOut)
def revoke_consent(revoke_in: ConsentRevoke, db: Session = Depends(get_db)):
    """Revoke consent (evidence clips, research, or all). Automatically purges clips if revoked."""
    consent = db.query(PatientConsent).filter(
        PatientConsent.patient_id == revoke_in.patient_id
    ).order_by(PatientConsent.signed_at.desc()).first()

    if not consent:
        raise HTTPException(status_code=404, detail="No active consent found to revoke")

    consent.is_revoked = True
    consent.revoked_at = datetime.now(timezone.utc)
    consent.revoked_scope = revoke_in.scope
    consent.revoked_reason = revoke_in.reason

    if revoke_in.scope in ["all", "evidence_clips"]:
        consent.consent_evidence_clips = False
        # Purge stored raw payloads/clips from database
        assessments = db.query(Assessment).filter(Assessment.patient_id == revoke_in.patient_id).all()
        for a in assessments:
            features = db.query(Feature).filter(Feature.assessment_id == a.id).all()
            for f in features:
                f.raw_payload = None

    if revoke_in.scope in ["all", "research"]:
        consent.consent_research = False

    consent.updated_at = datetime.now(timezone.utc)

    audit = AuditLog(
        action="REVOKE_CONSENT",
        target_entity="Patient",
        target_id=revoke_in.patient_id,
        details=f"Revoked consent scope: {revoke_in.scope}. Reason: {revoke_in.reason}. Evidence clips purged."
    )
    db.add(audit)
    db.commit()
    db.refresh(consent)

    return consent

@router.delete("/evidence/{patient_id}")
def delete_patient_evidence(patient_id: str, db: Session = Depends(get_db)):
    """Permanently delete all raw evidence clips and payload waveforms for a patient while keeping numeric features."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    assessments = db.query(Assessment).filter(Assessment.patient_id == patient_id).all()
    purged_count = 0
    for a in assessments:
        features = db.query(Feature).filter(Feature.assessment_id == a.id).all()
        for f in features:
            if f.raw_payload is not None:
                f.raw_payload = None
                purged_count += 1

    audit = AuditLog(
        action="DELETE_EVIDENCE",
        target_entity="Patient",
        target_id=patient_id,
        details=f"Permanently purged {purged_count} raw evidence payloads/clips upon patient request."
    )
    db.add(audit)
    db.commit()

    return {
        "status": "success",
        "patient_id": patient_id,
        "purged_records": purged_count,
        "message": "All raw evidence clips and payloads have been permanently removed."
    }
