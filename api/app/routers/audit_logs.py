from typing import List, Optional
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.schemas.audit_log import AuditLogCreate, AuditLogOut

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])

@router.get("", response_model=List[AuditLogOut])
def list_audit_logs(limit: int = 50, db: Session = Depends(get_db)):
    return db.query(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit).all()

@router.post("", response_model=AuditLogOut)
def record_audit_log(log_in: AuditLogCreate, db: Session = Depends(get_db)):
    audit = AuditLog(
        user_id=log_in.user_id,
        action=log_in.action,
        target_entity=log_in.target_entity,
        target_id=log_in.target_id,
        details=log_in.details,
        ip_address=log_in.ip_address
    )
    db.add(audit)
    db.commit()
    db.refresh(audit)
    return audit
