import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Text
from app.core.database import Base

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=True, index=True)
    action = Column(String(100), nullable=False)
    target_entity = Column(String(100), nullable=False)
    target_id = Column(String(36), nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String(50), nullable=True)
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
