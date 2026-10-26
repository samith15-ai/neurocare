import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Integer, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base

class Baseline(Base):
    __tablename__ = "baselines"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    domain = Column(String(30), nullable=False)
    feature_name = Column(String(100), nullable=False, index=True)
    mean_value = Column(Float, nullable=False)
    std_value = Column(Float, nullable=False)
    sample_count = Column(Integer, default=1, nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    patient = relationship("Patient", back_populates="baselines")
