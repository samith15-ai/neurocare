from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.patient import Patient
from app.models.treatment_event import TreatmentEvent
from app.models.audit_log import AuditLog
from app.schemas.longitudinal import (
    TreatmentEventCreate,
    TreatmentEventOut,
    LongitudinalIntelligenceReport,
)
from app.services.longitudinal_intelligence import LongitudinalIntelligenceService

router = APIRouter(prefix="/longitudinal", tags=["Longitudinal Intelligence"])

@router.get("/analysis/{patient_id}", response_model=LongitudinalIntelligenceReport)
def get_longitudinal_intelligence_analysis(patient_id: str, db: Session = Depends(get_db)):
    """
    Computes change detection, CUSUM change-points, recovery tracking, timeline states,
    and treatment event correlations for a patient.
    """
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    try:
        report = LongitudinalIntelligenceService.evaluate_patient_longitudinal_intelligence(patient_id, db)
        return report
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Longitudinal analysis failed: {str(e)}")

@router.get("/treatment-events/{patient_id}", response_model=List[TreatmentEventOut])
def get_treatment_events(patient_id: str, db: Session = Depends(get_db)):
    """Retrieve logged treatment and clinical intervention events for a patient."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    events = db.query(TreatmentEvent).filter(
        TreatmentEvent.patient_id == patient_id
    ).order_by(TreatmentEvent.event_date.asc()).all()
    return events

@router.post("/treatment-events", response_model=TreatmentEventOut, status_code=status.HTTP_201_CREATED)
def create_treatment_event(event_in: TreatmentEventCreate, db: Session = Depends(get_db)):
    """Log a clinical, pharmacological, or therapy treatment event on the timeline."""
    patient = db.query(Patient).filter(Patient.id == event_in.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    event = TreatmentEvent(
        patient_id=event_in.patient_id,
        event_type=event_in.event_type,
        event_date=event_in.event_date,
        title=event_in.title,
        description=event_in.description
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    audit = AuditLog(
        action="LOG_TREATMENT_EVENT",
        target_entity="TreatmentEvent",
        target_id=event.id,
        details=f"Logged {event.event_type} on {event.event_date}: '{event.title}'"
    )
    db.add(audit)
    db.commit()

    return event

@router.delete("/treatment-events/{event_id}")
def delete_treatment_event(event_id: str, db: Session = Depends(get_db)):
    """Delete a treatment event from the timeline."""
    event = db.query(TreatmentEvent).filter(TreatmentEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=404, detail="Treatment event not found")

    patient_id = event.patient_id
    title = event.title
    db.delete(event)
    db.commit()

    audit = AuditLog(
        action="DELETE_TREATMENT_EVENT",
        target_entity="TreatmentEvent",
        target_id=event_id,
        details=f"Deleted treatment event '{title}' for patient {patient_id}"
    )
    db.add(audit)
    db.commit()

    return {"status": "success", "deleted_id": event_id}
