from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.patient import Patient
from app.models.audit_log import AuditLog
from app.schemas.patient import PatientCreate, PatientUpdate, PatientOut

router = APIRouter(prefix="/patients", tags=["Patients"])

@router.get("", response_model=List[PatientOut])
def list_patients(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    patients = db.query(Patient).offset(skip).limit(limit).all()
    return patients

@router.post("", response_model=PatientOut, status_code=status.HTTP_201_CREATED)
def create_patient(patient_in: PatientCreate, db: Session = Depends(get_db)):
    existing = db.query(Patient).filter(Patient.mrn == patient_in.mrn).first()
    if existing:
        raise HTTPException(status_code=400, detail="Patient MRN already exists")
    
    new_patient = Patient(
        mrn=patient_in.mrn,
        first_name=patient_in.first_name,
        last_name=patient_in.last_name,
        date_of_birth=patient_in.date_of_birth,
        gender=patient_in.gender,
        primary_condition_notes=patient_in.primary_condition_notes
    )
    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)

    audit = AuditLog(
        action="CREATE_PATIENT",
        target_entity="Patient",
        target_id=new_patient.id,
        details=f"Created patient {new_patient.first_name} {new_patient.last_name} (MRN: {new_patient.mrn})"
    )
    db.add(audit)
    db.commit()

    return new_patient

@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: str, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient

@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient(patient_id: str, patient_update: PatientUpdate, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    update_data = patient_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(patient, field, value)
    
    db.commit()
    db.refresh(patient)
    return patient
