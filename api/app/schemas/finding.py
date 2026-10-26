from typing import Optional
from datetime import datetime
from pydantic import BaseModel

class FindingCreate(BaseModel):
    assessment_id: str
    domain: str
    finding_title: str
    explanation: str
    evidence_metrics: str
    clinical_relevance: str
    requires_review: bool = False
    status: str = "unreviewed"

class FindingOut(BaseModel):
    id: str
    assessment_id: str
    domain: str
    finding_title: str
    explanation: str
    evidence_metrics: str
    clinical_relevance: str
    requires_review: bool
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
