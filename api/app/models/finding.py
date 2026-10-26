import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class Finding(Base):
    __tablename__ = "findings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id = Column(String(36), ForeignKey("assessments.id"), nullable=False, index=True)
    domain = Column(String(30), nullable=False)  # facial, motor, vocal, composite
    finding_title = Column(String(200), nullable=False)
    explanation = Column(Text, nullable=False)
    evidence_metrics = Column(Text, nullable=False)  # JSON formatted key-values
    clinical_relevance = Column(String(100), nullable=False)  # e.g., "Observed change - May warrant clinical review"
    requires_review = Column(Boolean, default=False, nullable=False)
    status = Column(String(30), default="unreviewed", nullable=False)  # unreviewed, reviewed, acknowledged
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    assessment = relationship("Assessment", back_populates="findings")
