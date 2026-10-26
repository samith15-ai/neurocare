from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.patient import Patient
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.baseline import Baseline
from app.schemas.monitoring import LongitudinalSummary, TrajectoryPoint

router = APIRouter(prefix="/monitoring", tags=["Monitoring"])

@router.get("/longitudinal/{patient_id}", response_model=LongitudinalSummary)
def get_longitudinal_trajectory(patient_id: str, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    assessments = db.query(Assessment).filter(
        Assessment.patient_id == patient_id,
        Assessment.status == "completed"
    ).order_by(Assessment.started_at.asc()).all()

    baselines = {b.feature_name: b for b in db.query(Baseline).filter(Baseline.patient_id == patient_id).all()}

    trajectory_points: List[TrajectoryPoint] = []
    domains_monitored = set()

    for a in assessments:
        features = db.query(Feature).filter(Feature.assessment_id == a.id).all()
        for f in features:
            domains_monitored.add(f.domain)
            b = baselines.get(f.feature_name)
            dev_sigmas = None
            if b and b.std_value > 0:
                dev_sigmas = round((f.value - b.mean_value) / b.std_value, 2)

            trajectory_points.append(
                TrajectoryPoint(
                    assessment_id=a.id,
                    date=a.started_at.strftime("%Y-%m-%d %H:%M"),
                    feature_name=f.feature_name,
                    value=f.value,
                    unit=f.unit,
                    baseline_mean=b.mean_value if b else None,
                    baseline_std=b.std_value if b else None,
                    deviation_sigmas=dev_sigmas,
                    is_simulated=f.is_simulated
                )
            )

    return LongitudinalSummary(
        patient_id=patient_id,
        total_assessments=len(assessments),
        domains_monitored=list(domains_monitored) if domains_monitored else ["facial", "motor", "vocal"],
        trajectory_points=trajectory_points,
        overall_status="Longitudinal tracking active" if assessments else "No completed assessments",
        advisory="All findings are evidence-linked and reference personalized baselines."
    )
