from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict

class ExplainabilityQuery(BaseModel):
    patient_id: str
    assessment_id: Optional[str] = None
    question: str

class MetricEvidence(BaseModel):
    metric_name: str
    observed_value: float
    unit: str
    baseline_value: Optional[float] = None
    change_direction: str  # increased, decreased, stable
    relevance_note: str

class AIExplanationResponse(BaseModel):
    summary: str
    evidence_points: List[MetricEvidence]
    clinical_caution: str = (
        "Notice: This explanation is an automated algorithmic decision-support aid. "
        "It does not constitute a diagnostic determination and must be reviewed by a qualified healthcare professional."
    )
    confidence: float = 0.95

# Phase 7: Grounded AI Assistant Schemas

class AIChatRequest(BaseModel):
    patient_id: str
    message: str
    conversation_history: Optional[List[Dict[str, str]]] = None
    assessment_id: Optional[str] = None

class ToolCallResult(BaseModel):
    tool_name: str
    summary: str
    data: Dict[str, Any]

class AIChatResponse(BaseModel):
    response: str
    role_adapted_mode: str  # "patient" or "doctor"
    tool_calls: List[ToolCallResult]
    observations: List[str]
    interpretations: List[str]
    quality_notes: Optional[str] = None
    emergency_advisory: Optional[str] = None
    disclaimer: str = (
        "Non-diagnostic decision-support aid. All numerical statements derive directly from stored sensor kinematics. "
        "Does not constitute medical advice or disease diagnosis."
    )

class ClinicianSummaryDraft(BaseModel):
    patient_id: str
    patient_name: str
    mrn: str
    subjective: str
    objective: str
    assessment: str
    plan: str
    is_approved: bool = False
    disclaimer: str = (
        "AI-Generated Draft: Requires clinical review, editing, and explicit approval before entering the medical record."
    )

class ClinicianSummaryApproveRequest(BaseModel):
    patient_id: str
    subjective: str
    objective: str
    assessment: str
    plan: str
    explicit_approval: bool

class ClinicianSummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    doctor_id: str
    subjective: str
    objective: str
    assessment: str
    plan: str
    is_approved: bool
    approved_at: Optional[datetime] = None
    created_at: datetime
