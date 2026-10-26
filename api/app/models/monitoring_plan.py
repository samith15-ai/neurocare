import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class MonitoringPlan(Base):
    __tablename__ = "monitoring_plans"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    clinician_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    assessment_types = Column(String(255), default="finger_tapping,speech", nullable=False)  # comma separated
    frequency = Column(String(30), default="daily", nullable=False)  # daily, twice_weekly, weekly
    start_date = Column(String(10), nullable=False)  # YYYY-MM-DD
    duration_days = Column(Integer, default=30, nullable=False)
    reminder_time = Column(String(5), default="09:00", nullable=False)  # HH:MM
    reminder_enabled = Column(Boolean, default=True, nullable=False)
    reminder_channel = Column(String(30), default="in_app", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    patient = relationship("Patient", backref="monitoring_plans")
