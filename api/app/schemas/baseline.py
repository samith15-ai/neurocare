from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict

class BaselineCreate(BaseModel):
    patient_id: str
    domain: str
    feature_name: str
    mean_value: float
    std_value: float
    median_value: Optional[float] = None
    mad_value: Optional[float] = None
    min_mad_floor: Optional[float] = 0.01
    sample_count: int = 1
    is_established: bool = False
    is_frozen: bool = False
    status_message: Optional[str] = "Personal baseline is not yet established."

class BaselineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    domain: str
    feature_name: str
    mean_value: float
    std_value: float
    median_value: Optional[float] = None
    mad_value: Optional[float] = None
    min_mad_floor: Optional[float] = 0.01
    sample_count: int
    is_established: bool
    is_frozen: bool
    status_message: str
    updated_at: datetime
