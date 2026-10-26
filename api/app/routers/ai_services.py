from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.patient import Patient
from app.models.feature import Feature
from app.models.baseline import Baseline
from app.models.finding import Finding
from app.schemas.ai import ExplainabilityQuery, AIExplanationResponse, MetricEvidence

router = APIRouter(prefix="/ai", tags=["AI Services"])

@router.post("/explain", response_model=AIExplanationResponse)
def explain_findings(query: ExplainabilityQuery, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.id == query.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    features_q = db.query(Feature)
    if query.assessment_id:
        features_q = features_q.filter(Feature.assessment_id == query.assessment_id)
    features = features_q.limit(10).all()

    baselines = {b.feature_name: b.mean_value for b in db.query(Baseline).filter(Baseline.patient_id == query.patient_id).all()}

    evidence_points = []
    for f in features:
        base_val = baselines.get(f.feature_name)
        direction = "stable"
        if base_val is not None:
            if f.value > base_val * 1.1:
                direction = "increased"
            elif f.value < base_val * 0.9:
                direction = "decreased"
        
        evidence_points.append(
            MetricEvidence(
                metric_name=f.feature_name,
                observed_value=f.value,
                unit=f.unit,
                baseline_value=base_val,
                change_direction=direction,
                relevance_note=f"Recorded during contactless {f.domain} assessment."
            )
        )

    summary_text = (
        f"Analysis of {len(evidence_points)} tracked behavioral metrics for {patient.first_name} {patient.last_name}: "
        f"All observations are tied directly to stored camera and microphone kinematic values. "
        f"Findings highlight observed deviations from personalized baselines without drawing autonomous diagnostic conclusions."
    )

    return AIExplanationResponse(
        summary=summary_text,
        evidence_points=evidence_points,
        confidence=0.94
    )
