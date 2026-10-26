import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, ForeignKey
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
    median_value = Column(Float, nullable=True)
    mad_value = Column(Float, nullable=True)
    min_mad_floor = Column(Float, nullable=True, default=0.01)
    sample_count = Column(Integer, default=1, nullable=False)
    is_established = Column(Boolean, default=False, nullable=False)
    is_frozen = Column(Boolean, default=False, nullable=False)
    status_message = Column(String(100), default="Personal baseline is not yet established.", nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    patient = relationship("Patient", back_populates="baselines")
