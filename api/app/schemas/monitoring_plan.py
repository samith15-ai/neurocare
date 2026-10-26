from datetime import datetime
from typing import Optional, List, Union
from pydantic import BaseModel, ConfigDict

class MonitoringPlanCreate(BaseModel):
    patient_id: str
    clinician_id: Optional[str] = None
    assessment_types: Union[List[str], str] = ["finger_tapping", "speech"]
    frequency: str = "daily"
    start_date: str  # YYYY-MM-DD
    duration_days: int = 30
    reminder_time: str = "09:00"
    reminder_enabled: bool = True
    reminder_channel: str = "in_app"

class MonitoringPlanUpdate(BaseModel):
    assessment_types: Optional[Union[List[str], str]] = None
    frequency: Optional[str] = None
    duration_days: Optional[int] = None
    reminder_time: Optional[str] = None
    reminder_enabled: Optional[bool] = None
    reminder_channel: Optional[str] = None
    is_active: Optional[bool] = None

class MonitoringPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    clinician_id: str
    assessment_types: str
    frequency: str
    start_date: str
    duration_days: int
    reminder_time: str
    reminder_enabled: bool
    reminder_channel: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
