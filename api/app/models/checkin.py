import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class DailyCheckin(Base):
    __tablename__ = "daily_checkins"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    assessment_id = Column(String(36), ForeignKey("assessments.id"), nullable=True)
    checkin_date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    idempotency_key = Column(String(64), unique=True, index=True, nullable=False)

    # Contextual variables (Explicitly NOT neurological findings)
    medication_taken = Column(Boolean, default=False, nullable=False)
    medication_notes = Column(String(255), nullable=True)
    sleep_quality = Column(Integer, nullable=True)  # 1 (poor) to 5 (excellent)
    fatigue_level = Column(Integer, nullable=True)  # 1 (none) to 5 (severe)
    pain_level = Column(Integer, nullable=True)     # 1 (none) to 5 (severe)
    stress_level = Column(Integer, nullable=True)   # 1 (low) to 5 (extreme)

    is_synced = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    patient = relationship("Patient", backref="daily_checkins")
    assessment = relationship("Assessment", backref="checkin")
