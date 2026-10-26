from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

class QualityCheckResult(BaseModel):
    passed: bool
    lighting_ok: bool
    framing_ok: bool
    audio_snr_ok: bool
    rejection_code: Optional[str] = None
    guidance: Optional[str] = None

class AssessmentCreate(BaseModel):
    patient_id: str
    assessment_type: str = "multimodal_standard"
    is_simulated: bool = False
    quality_notes: Optional[str] = None
    quality_gate_passed: bool = True

class AssessmentOut(BaseModel):
    id: str
    patient_id: str
    clinician_id: Optional[str] = None
    assessment_type: str
    status: str
    quality_gate_passed: bool
    quality_notes: Optional[str] = None
    is_simulated: bool
    started_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True
