from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.patient import Patient
from app.models.user import User
from app.models.monitoring_plan import MonitoringPlan
from app.models.audit_log import AuditLog
from app.schemas.monitoring_plan import MonitoringPlanCreate, MonitoringPlanUpdate, MonitoringPlanOut

router = APIRouter(prefix="/monitoring-plans", tags=["Monitoring Plans"])

@router.get("/patient/{patient_id}", response_model=Optional[MonitoringPlanOut])
def get_patient_monitoring_plan(patient_id: str, db: Session = Depends(get_db)):
    """Fetch active monitoring plan for a patient."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    plan = db.query(MonitoringPlan).filter(
        MonitoringPlan.patient_id == patient_id,
        MonitoringPlan.is_active == True
    ).order_by(MonitoringPlan.created_at.desc()).first()

    return plan

@router.post("", response_model=MonitoringPlanOut, status_code=status.HTTP_201_CREATED)
def create_or_replace_monitoring_plan(plan_in: MonitoringPlanCreate, db: Session = Depends(get_db)):
    """Doctor configures or updates a patient's personalized monitoring plan."""
    patient = db.query(Patient).filter(Patient.id == plan_in.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    clinician_id = plan_in.clinician_id
    if not clinician_id:
        doc = db.query(User).filter(User.role == "doctor").first()
        clinician_id = doc.id if doc else "system"

    # Convert assessment_types list to comma string if needed
    if isinstance(plan_in.assessment_types, list):
        types_str = ",".join(plan_in.assessment_types)
    else:
        types_str = plan_in.assessment_types

    # Deactivate existing active plans for patient
    existing_plans = db.query(MonitoringPlan).filter(
        MonitoringPlan.patient_id == plan_in.patient_id,
        MonitoringPlan.is_active == True
    ).all()
    for p in existing_plans:
        p.is_active = False

    new_plan = MonitoringPlan(
        patient_id=plan_in.patient_id,
        clinician_id=clinician_id,
        assessment_types=types_str,
        frequency=plan_in.frequency,
        start_date=plan_in.start_date,
        duration_days=plan_in.duration_days,
        reminder_time=plan_in.reminder_time,
        reminder_enabled=plan_in.reminder_enabled,
        reminder_channel=plan_in.reminder_channel,
        is_active=True
    )
    db.add(new_plan)
    db.commit()
    db.refresh(new_plan)

    audit = AuditLog(
        action="SET_MONITORING_PLAN",
        user_id=clinician_id,
        target_entity="MonitoringPlan",
        target_id=new_plan.id,
        details=f"Configured monitoring plan: frequency={new_plan.frequency}, duration={new_plan.duration_days}d, tasks={new_plan.assessment_types}."
    )
    db.add(audit)
    db.commit()

    return new_plan

@router.patch("/{plan_id}", response_model=MonitoringPlanOut)
def update_monitoring_plan(plan_id: str, plan_update: MonitoringPlanUpdate, db: Session = Depends(get_db)):
    """Update active plan parameters."""
    plan = db.query(MonitoringPlan).filter(MonitoringPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Monitoring plan not found")

    update_data = plan_update.model_dump(exclude_unset=True)
    if "assessment_types" in update_data and isinstance(update_data["assessment_types"], list):
        update_data["assessment_types"] = ",".join(update_data["assessment_types"])

    for field, value in update_data.items():
        setattr(plan, field, value)

    plan.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(plan)

    audit = AuditLog(
        action="UPDATE_MONITORING_PLAN",
        target_entity="MonitoringPlan",
        target_id=plan.id,
        details=f"Updated monitoring plan {plan.id}."
    )
    db.add(audit)
    db.commit()

    return plan
