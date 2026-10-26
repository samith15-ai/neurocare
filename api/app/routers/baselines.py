from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.baseline import Baseline
from app.models.patient import Patient
from app.schemas.baseline import BaselineCreate, BaselineOut

router = APIRouter(prefix="/baselines", tags=["Baselines"])

@router.get("/{patient_id}", response_model=List[BaselineOut])
def get_patient_baselines(patient_id: str, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    return db.query(Baseline).filter(Baseline.patient_id == patient_id).all()

@router.post("", response_model=BaselineOut, status_code=status.HTTP_201_CREATED)
def set_or_update_baseline(baseline_in: BaselineCreate, db: Session = Depends(get_db)):
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
        existing.sample_count = baseline_in.sample_count
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
            sample_count=baseline_in.sample_count
        )
        db.add(new_baseline)
        db.commit()
        db.refresh(new_baseline)
        return new_baseline
