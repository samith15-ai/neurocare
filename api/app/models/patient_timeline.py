import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class PatientTimelineState(Base):
    __tablename__ = "patient_timeline_states"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False, unique=True, index=True)
    current_state = Column(String(30), default="baseline", nullable=False)
    onset_date = Column(String(10), nullable=True)
    peak_deviation_date = Column(String(10), nullable=True)
    peak_deviation_z = Column(Float, nullable=True, default=0.0)
    current_deviation_z = Column(Float, nullable=True, default=0.0)
    recovery_index = Column(Float, nullable=True, default=100.0)
    plateau_detected = Column(Boolean, default=False, nullable=False)
    alert_level = Column(String(20), default="stable", nullable=False)
    explanation = Column(Text, nullable=True)
    last_evaluated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    patient = relationship("Patient", backref="timeline_state")
