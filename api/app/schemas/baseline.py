from datetime import datetime
from pydantic import BaseModel

class BaselineCreate(BaseModel):
    patient_id: str
    domain: str
    feature_name: str
    mean_value: float
    std_value: float
    sample_count: int = 1

class BaselineOut(BaseModel):
    id: str
    patient_id: str
    domain: str
    feature_name: str
    mean_value: float
    std_value: float
    sample_count: int
    updated_at: datetime

    class Config:
        from_attributes = True
