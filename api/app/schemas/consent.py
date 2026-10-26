from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class ConsentCreate(BaseModel):
    patient_id: str
    consent_version: str = "v1.0"
    consent_features: bool = True
    consent_evidence_clips: bool = False
    consent_research: bool = False
    signature_name: str

class ConsentRevoke(BaseModel):
    patient_id: str
    scope: str = "evidence_clips"  # all, evidence_clips, research
    reason: Optional[str] = "Patient requested revocation"

class ConsentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    consent_version: str
    consent_features: bool
    consent_evidence_clips: bool
    consent_research: bool
    is_revoked: bool
    revoked_at: Optional[datetime] = None
    revoked_scope: Optional[str] = None
    revoked_reason: Optional[str] = None
    signature_name: str
    signed_at: datetime
    updated_at: datetime
