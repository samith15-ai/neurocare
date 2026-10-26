from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel
from app.schemas.finding import FindingOut
from app.schemas.feature import FeatureOut

class ReportCreate(BaseModel):
    assessment_id: str
    patient_id: str
    summary_text: str
    late_fusion_score: Optional[float] = None
    emergency_fast_triggered: bool = False
    emergency_details: Optional[str] = None
    explainability_notes: Optional[str] = None
    is_simulated: bool = False

class ReportOut(BaseModel):
    id: str
    assessment_id: str
    patient_id: str
    summary_text: str
    late_fusion_score: Optional[float]
    emergency_fast_triggered: bool
    emergency_details: Optional[str]
    explainability_notes: Optional[str]
    is_simulated: bool
    approved_by_doctor: bool
    approved_by_user_id: Optional[str]
    created_at: datetime
    findings: Optional[List[FindingOut]] = None
    features: Optional[List[FeatureOut]] = None

    class Config:
        from_attributes = True
