import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class Feature(Base):
    __tablename__ = "features"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id = Column(String(36), ForeignKey("assessments.id"), nullable=False, index=True)
    domain = Column(String(30), nullable=False)  # facial, motor, vocal
    feature_name = Column(String(100), nullable=False, index=True)
    value = Column(Float, nullable=False)
    unit = Column(String(30), nullable=False)
    confidence = Column(Float, nullable=False, default=1.0)
    is_simulated = Column(Boolean, default=False, nullable=False)
    raw_payload = Column(Text, nullable=True)  # JSON serialized data points or waveform summary
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    assessment = relationship("Assessment", back_populates="features")
