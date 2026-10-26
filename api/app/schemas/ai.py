from typing import List, Optional
from pydantic import BaseModel

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
