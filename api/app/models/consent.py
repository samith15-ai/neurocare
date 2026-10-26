import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class PatientConsent(Base):
    __tablename__ = "patient_consents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id = Column(String(36), ForeignKey("patients.id"), nullable=False, index=True)
    consent_version = Column(String(20), default="v1.0", nullable=False)
    consent_features = Column(Boolean, default=True, nullable=False)
    consent_evidence_clips = Column(Boolean, default=False, nullable=False)
    consent_research = Column(Boolean, default=False, nullable=False)
    
    # Revocation support
    is_revoked = Column(Boolean, default=False, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    revoked_scope = Column(String(50), nullable=True)  # all, evidence_clips, research
    revoked_reason = Column(Text, nullable=True)

    # Attribution
    signature_name = Column(String(100), nullable=False)
    ip_address = Column(String(45), nullable=True)
    signed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    patient = relationship("Patient", backref="consents")
