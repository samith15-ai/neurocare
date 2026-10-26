import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import relationship
from app.core.database import Base

class Report(Base):
    __tablename__ = "reports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id = Column(String(36), ForeignKey("assessments.id"), unique=True, nullable=False)
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    summary_text = Column(Text, nullable=False)
    overall_status = Column(String(30), default="No flag", nullable=False)  # "No flag", "Watch", "Review advised"
    late_fusion_score = Column(Float, nullable=True)
    domain_scores_json = Column(Text, nullable=True)  # JSON: { motor: 0.4, speech: 0.2, facial: 0.1, gait: null }
    emergency_fast_triggered = Column(Boolean, default=False, nullable=False)
    emergency_details = Column(Text, nullable=True)
    explainability_notes = Column(Text, nullable=True)
    is_simulated = Column(Boolean, default=False, nullable=False)
    
    # Doctor Review & Feedback
    approved_by_doctor = Column(Boolean, default=False, nullable=False)
    approved_by_user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    doctor_feedback = Column(String(20), nullable=True)  # "agree", "disagree", "unsure"
    doctor_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    assessment = relationship("Assessment", back_populates="report")
    patient = relationship("Patient", back_populates="reports")
