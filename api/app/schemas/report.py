from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.finding import FindingOut
from app.schemas.feature import FeatureOut

class DoctorReviewSubmit(BaseModel):
    feedback: str  # "agree", "disagree", "unsure"
    notes: Optional[str] = None
    doctor_user_id: Optional[str] = None

class ReportCreate(BaseModel):
    assessment_id: str
    patient_id: str
    summary_text: str
    overall_status: str = "No flag"
    late_fusion_score: Optional[float] = None
    domain_scores_json: Optional[str] = None
    emergency_fast_triggered: bool = False
    emergency_details: Optional[str] = None
    explainability_notes: Optional[str] = None
    is_simulated: bool = False

class ReportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    assessment_id: str
    patient_id: str
    summary_text: str
    overall_status: str
    late_fusion_score: Optional[float]
    domain_scores_json: Optional[str] = None
    emergency_fast_triggered: bool
    emergency_details: Optional[str]
    explainability_notes: Optional[str]
    is_simulated: bool
    approved_by_doctor: bool
    approved_by_user_id: Optional[str]
    doctor_feedback: Optional[str] = None
    doctor_notes: Optional[str] = None
    created_at: datetime
    findings: Optional[List[FindingOut]] = None
    features: Optional[List[FeatureOut]] = None
