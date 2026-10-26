from typing import Optional, Any
from datetime import datetime
from pydantic import BaseModel

class FeatureCreate(BaseModel):
    assessment_id: str
    domain: str  # facial, motor, vocal
    feature_name: str
    value: float
    unit: str
    confidence: float = 1.0
    is_simulated: bool = False
    raw_payload: Optional[str] = None

class FeatureOut(BaseModel):
    id: str
    assessment_id: str
    domain: str
    feature_name: str
    value: float
    unit: str
    confidence: float
    is_simulated: bool
    created_at: datetime

    class Config:
        from_attributes = True
