from datetime import datetime, timezone, timedelta
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.patient import Patient
from app.models.checkin import DailyCheckin
from app.models.monitoring_plan import MonitoringPlan
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.audit_log import AuditLog
from app.schemas.checkin import (
    DailyCheckinCreate,
    DailyCheckinOut,
    DailyCheckinStatusOut,
    SyncBatchRequest,
    SyncBatchResponse
)
from app.services.baseline_service import BaselineEngineService

router = APIRouter(prefix="/checkins", tags=["Daily Check-in & Sync"])

def _calculate_streak(patient_id: str, db: Session) -> int:
    """Calculates consecutive days completed streak ending today or yesterday."""
    checkins = db.query(DailyCheckin.checkin_date).filter(
        DailyCheckin.patient_id == patient_id
    ).distinct().order_by(DailyCheckin.checkin_date.desc()).all()

    if not checkins:
        return 0

    dates = {c[0] for c in checkins}
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    yesterday = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")

    current_date = datetime.now(timezone.utc)
    if today not in dates and yesterday not in dates:
        return 0

    streak = 0
    # Start counting back from today if completed, or yesterday
    check_day = current_date if today in dates else (current_date - timedelta(days=1))
    while True:
        d_str = check_day.strftime("%Y-%m-%d")
        if d_str in dates:
            streak += 1
            check_day -= timedelta(days=1)
        else:
            break

    return streak

@router.get("/today/{patient_id}", response_model=DailyCheckinStatusOut)
def get_today_checkin_status(patient_id: str, db: Session = Depends(get_db)):
    """Fetch today's check-in status, completion flag, and current streak."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    today_checkin = db.query(DailyCheckin).filter(
        DailyCheckin.patient_id == patient_id,
        DailyCheckin.checkin_date == today_str
    ).first()

    total_count = db.query(DailyCheckin).filter(DailyCheckin.patient_id == patient_id).count()
    streak = _calculate_streak(patient_id, db)

    # Check active plan for reminder time
    plan = db.query(MonitoringPlan).filter(
        MonitoringPlan.patient_id == patient_id,
        MonitoringPlan.is_active == True
    ).first()
    reminder_time = plan.reminder_time if plan else "09:00"

    is_completed = today_checkin is not None
    msg = (
        f"Great job! Today's check-in is complete. You have a {streak}-day monitoring streak! 🔥"
        if is_completed
        else "Today's daily check-in is ready. Complete your short tasks to maintain your streak."
    )

    return DailyCheckinStatusOut(
        patient_id=patient_id,
        is_completed_today=is_completed,
        today_checkin=today_checkin,
        current_streak=streak,
        total_completed=total_count,
        reminder_time=reminder_time,
        message=msg
    )

@router.post("", response_model=DailyCheckinOut, status_code=status.HTTP_201_CREATED)
def submit_daily_checkin(checkin_in: DailyCheckinCreate, db: Session = Depends(get_db)):
    """
    Submit daily check-in with context tags and duplicate prevention.
    Idempotent: if idempotency_key is repeated, returns the existing record without creating a duplicate.
    """
    # 1. Duplicate prevention via idempotency_key
    existing = db.query(DailyCheckin).filter(
        DailyCheckin.idempotency_key == checkin_in.idempotency_key
    ).first()
    if existing:
        return existing

    patient = db.query(Patient).filter(Patient.id == checkin_in.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    # 2. Check if a check-in for this patient on this date already exists
    existing_for_date = db.query(DailyCheckin).filter(
        DailyCheckin.patient_id == checkin_in.patient_id,
        DailyCheckin.checkin_date == checkin_in.checkin_date
    ).first()

    if existing_for_date:
        # Update context tags idempotently instead of creating duplicate
        existing_for_date.medication_taken = checkin_in.medication_taken
        if checkin_in.medication_notes:
            existing_for_date.medication_notes = checkin_in.medication_notes
        if checkin_in.sleep_quality:
            existing_for_date.sleep_quality = checkin_in.sleep_quality
        if checkin_in.fatigue_level:
            existing_for_date.fatigue_level = checkin_in.fatigue_level
        if checkin_in.pain_level:
            existing_for_date.pain_level = checkin_in.pain_level
        if checkin_in.stress_level:
            existing_for_date.stress_level = checkin_in.stress_level
        if checkin_in.assessment_id:
            existing_for_date.assessment_id = checkin_in.assessment_id
        db.commit()
        db.refresh(existing_for_date)
        return existing_for_date

    new_checkin = DailyCheckin(
        patient_id=checkin_in.patient_id,
        assessment_id=checkin_in.assessment_id,
        checkin_date=checkin_in.checkin_date,
        idempotency_key=checkin_in.idempotency_key,
        medication_taken=checkin_in.medication_taken,
        medication_notes=checkin_in.medication_notes,
        sleep_quality=checkin_in.sleep_quality,
        fatigue_level=checkin_in.fatigue_level,
        pain_level=checkin_in.pain_level,
        stress_level=checkin_in.stress_level,
        is_synced=True
    )
    db.add(new_checkin)
    db.commit()
    db.refresh(new_checkin)

    # 3. Trigger baseline calculation check (if 3 sessions reached, automatically establish personal baseline)
    BaselineEngineService.calculate_patient_baseline(checkin_in.patient_id, db)

    # 4. Audit log
    audit = AuditLog(
        action="DAILY_CHECKIN",
        target_entity="DailyCheckin",
        target_id=new_checkin.id,
        details=f"Completed daily check-in for date {checkin_in.checkin_date}. Context tags: med={checkin_in.medication_taken}, sleep={checkin_in.sleep_quality}, fatigue={checkin_in.fatigue_level}."
    )
    db.add(audit)
    db.commit()

    return new_checkin

@router.post("/sync-batch", response_model=SyncBatchResponse)
def sync_offline_checkins(batch_req: SyncBatchRequest, db: Session = Depends(get_db)):
    """
    Batch sync endpoint for offline-queued check-ins from Dexie IndexedDB.
    Enforces idempotency and duplicate prevention.
    """
    synced = []
    skipped = 0

    for item in batch_req.checkins:
        # Check idempotency
        existing = db.query(DailyCheckin).filter(
            DailyCheckin.idempotency_key == item.idempotency_key
        ).first()

        if existing:
            skipped += 1
            synced.append(existing)
            continue

        existing_date = db.query(DailyCheckin).filter(
            DailyCheckin.patient_id == item.patient_id,
            DailyCheckin.checkin_date == item.checkin_date
        ).first()

        if existing_date:
            skipped += 1
            synced.append(existing_date)
            continue

        new_record = DailyCheckin(
            patient_id=item.patient_id,
            assessment_id=item.assessment_id,
            checkin_date=item.checkin_date,
            idempotency_key=item.idempotency_key,
            medication_taken=item.medication_taken,
            medication_notes=item.medication_notes,
            sleep_quality=item.sleep_quality,
            fatigue_level=item.fatigue_level,
            pain_level=item.pain_level,
            stress_level=item.stress_level,
            is_synced=True
        )
        db.add(new_record)
        db.flush()
        synced.append(new_record)

    db.commit()

    # If any new items synced, re-check baseline
    if synced:
        patient_ids = {c.patient_id for c in synced}
        for pid in patient_ids:
            BaselineEngineService.calculate_patient_baseline(pid, db)

    audit = AuditLog(
        action="SYNC_OFFLINE_BATCH",
        target_entity="DailyCheckin",
        target_id="batch",
        details=f"Synced {len(synced) - skipped} offline check-ins ({skipped} duplicates skipped)."
    )
    db.add(audit)
    db.commit()

    return SyncBatchResponse(
        synced_count=len(synced) - skipped,
        duplicates_skipped=skipped,
        checkins=synced
    )
