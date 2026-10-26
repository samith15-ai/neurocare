import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class TreatmentEvent(Base):
    __tablename__ = "treatment_events"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    logged_by = Column(String(36), ForeignKey("users.id"), nullable=True)
    event_type = Column(String(50), nullable=False)  # medication_change, therapy_session, surgery, lifestyle, other
    event_date = Column(String(10), nullable=False, index=True)  # YYYY-MM-DD
    title = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    patient = relationship("Patient", backref="treatment_events")
