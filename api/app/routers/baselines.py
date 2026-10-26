from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.baseline import Baseline
from app.models.patient import Patient
from app.schemas.baseline import BaselineCreate, BaselineOut
from app.services.baseline_service import BaselineEngineService

router = APIRouter(prefix="/baselines", tags=["Baselines"])

@router.get("/{patient_id}", response_model=List[BaselineOut])
def get_patient_baselines(patient_id: str, db: Session = Depends(get_db)):
    """Fetch all baseline records for a patient."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    return db.query(Baseline).filter(Baseline.patient_id == patient_id).all()

@router.get("/{patient_id}/status")
def get_patient_baseline_status(patient_id: str, db: Session = Depends(get_db)):
    """Check if personal baseline is established and frozen, or still pending sufficient valid sessions."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    baselines = db.query(Baseline).filter(Baseline.patient_id == patient_id).all()
    if not baselines:
        return {
            "patient_id": patient_id,
            "is_established": False,
            "is_frozen": False,
            "sample_count": 0,
            "required_sessions": BaselineEngineService.MIN_REQUIRED_SESSIONS,
            "status_message": "Personal baseline is not yet established.",
            "baselines": []
        }

    is_established = any(b.is_established for b in baselines)
    is_frozen = all(b.is_frozen for b in baselines) if baselines else False
    sample_count = max((b.sample_count for b in baselines), default=0)
    status_msg = baselines[0].status_message if baselines else "Personal baseline is not yet established."

    return {
        "patient_id": patient_id,
        "is_established": is_established,
        "is_frozen": is_frozen,
        "sample_count": sample_count,
        "required_sessions": BaselineEngineService.MIN_REQUIRED_SESSIONS,
        "status_message": status_msg,
        "baselines": [
            {
                "domain": b.domain,
                "feature_name": b.feature_name,
                "median_value": b.median_value or b.mean_value,
                "mad_value": b.mad_value,
                "std_value": b.std_value,
                "sample_count": b.sample_count,
                "is_frozen": b.is_frozen
            }
            for b in baselines
        ]
    }

@router.post("/{patient_id}/compute")
def compute_patient_baseline(patient_id: str, force_recompute: bool = False, db: Session = Depends(get_db)):
    """Triggers baseline computation using Median and MAD over valid sessions."""
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    result = BaselineEngineService.calculate_patient_baseline(patient_id, db, force_recompute=force_recompute)
    return result

@router.post("", response_model=BaselineOut, status_code=status.HTTP_201_CREATED)
def set_or_update_baseline(baseline_in: BaselineCreate, db: Session = Depends(get_db)):
    """Doctor or system explicitly sets or updates a baseline feature."""
    patient = db.query(Patient).filter(Patient.id == baseline_in.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    existing = db.query(Baseline).filter(
        Baseline.patient_id == baseline_in.patient_id,
        Baseline.feature_name == baseline_in.feature_name
    ).first()

    if existing:
        existing.mean_value = baseline_in.mean_value
        existing.std_value = baseline_in.std_value
        if baseline_in.median_value is not None:
            existing.median_value = baseline_in.median_value
        if baseline_in.mad_value is not None:
            existing.mad_value = baseline_in.mad_value
        existing.sample_count = baseline_in.sample_count
        existing.is_established = baseline_in.is_established
        existing.is_frozen = baseline_in.is_frozen
        if baseline_in.status_message:
            existing.status_message = baseline_in.status_message
        existing.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing
    else:
        new_baseline = Baseline(
            patient_id=baseline_in.patient_id,
            domain=baseline_in.domain,
            feature_name=baseline_in.feature_name,
            mean_value=baseline_in.mean_value,
            std_value=baseline_in.std_value,
            median_value=baseline_in.median_value or baseline_in.mean_value,
            mad_value=baseline_in.mad_value,
            min_mad_floor=baseline_in.min_mad_floor,
            sample_count=baseline_in.sample_count,
            is_established=baseline_in.is_established,
            is_frozen=baseline_in.is_frozen,
            status_message=baseline_in.status_message or "Personal baseline is not yet established."
        )
        db.add(new_baseline)
        db.commit()
        db.refresh(new_baseline)
        return new_baseline
