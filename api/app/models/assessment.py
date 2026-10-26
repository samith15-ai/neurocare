import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    clinician_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    assessment_type = Column(String(50), nullable=False, default="multimodal_standard")  # facial, motor, vocal, multimodal
    status = Column(String(30), nullable=False, default="pending")  # pending, completed, rejected_quality
    quality_gate_passed = Column(Boolean, default=False, nullable=False)
    quality_notes = Column(Text, nullable=True)
    is_simulated = Column(Boolean, default=False, nullable=False)
    started_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    completed_at = Column(DateTime, nullable=True)

    patient = relationship("Patient", back_populates="assessments")
    features = relationship("Feature", back_populates="assessment", cascade="all, delete-orphan")
    findings = relationship("Finding", back_populates="assessment", cascade="all, delete-orphan")
    report = relationship("Report", back_populates="assessment", uselist=False, cascade="all, delete-orphan")
