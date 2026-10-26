from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel

class PatientBase(BaseModel):
    mrn: str
    first_name: str
    last_name: str
    date_of_birth: str
    gender: str
    primary_condition_notes: Optional[str] = None

class PatientCreate(PatientBase):
    pass

class PatientUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    gender: Optional[str] = None
    primary_condition_notes: Optional[str] = None

class PatientOut(PatientBase):
    id: str
    user_id: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
