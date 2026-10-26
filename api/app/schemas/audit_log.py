from typing import Optional
from datetime import datetime
from pydantic import BaseModel

class AuditLogCreate(BaseModel):
    user_id: Optional[str] = None
    action: str
    target_entity: str
    target_id: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None

class AuditLogOut(BaseModel):
    id: str
    user_id: Optional[str]
    action: str
    target_entity: str
    target_id: Optional[str]
    details: Optional[str]
    ip_address: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True
