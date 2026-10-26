from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict

class DailyCheckinCreate(BaseModel):
    patient_id: str
    assessment_id: Optional[str] = None
    checkin_date: str  # YYYY-MM-DD
    idempotency_key: str
    medication_taken: bool = False
    medication_notes: Optional[str] = None
    sleep_quality: Optional[int] = None  # 1-5
    fatigue_level: Optional[int] = None  # 1-5
    pain_level: Optional[int] = None     # 1-5
    stress_level: Optional[int] = None   # 1-5

class DailyCheckinOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    assessment_id: Optional[str] = None
    checkin_date: str
    idempotency_key: str
    medication_taken: bool
    medication_notes: Optional[str] = None
    sleep_quality: Optional[int] = None
    fatigue_level: Optional[int] = None
    pain_level: Optional[int] = None
    stress_level: Optional[int] = None
    is_synced: bool
    created_at: datetime

class DailyCheckinStatusOut(BaseModel):
    patient_id: str
    is_completed_today: bool
    today_checkin: Optional[DailyCheckinOut] = None
    current_streak: int
    total_completed: int
    reminder_time: Optional[str] = "09:00"
    message: str

class SyncBatchRequest(BaseModel):
    checkins: List[DailyCheckinCreate]

class SyncBatchResponse(BaseModel):
    synced_count: int
    duplicates_skipped: int
    checkins: List[DailyCheckinOut]
