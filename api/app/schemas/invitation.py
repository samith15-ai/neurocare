from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, EmailStr

class InvitationCreate(BaseModel):
    patient_id: Optional[str] = None
    patient_email: Optional[EmailStr] = None
    expires_in_days: int = 7

class InvitationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    doctor_id: str
    patient_id: Optional[str] = None
    patient_email: Optional[str] = None
    status: str
    expires_at: datetime
    created_at: datetime
    invite_url: Optional[str] = None

class RegisterWithInvite(BaseModel):
    invite_code: str
    email: EmailStr
    password: str
    first_name: str
    last_name: str
    date_of_birth: str  # YYYY-MM-DD
    gender: str
    mrn: Optional[str] = None
    primary_condition_notes: Optional[str] = None
    
    # Granular consent
    consent_version: str = "v1.0"
    consent_features: bool = True
    consent_evidence_clips: bool = False
    consent_research: bool = False
    signature_name: str
