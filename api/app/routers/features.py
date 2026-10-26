from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.feature import Feature
from app.models.assessment import Assessment
from app.schemas.feature import FeatureCreate, FeatureOut

router = APIRouter(prefix="/features", tags=["Features"])

@router.get("", response_model=List[FeatureOut])
def list_features(assessment_id: Optional[str] = None, domain: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Feature)
    if assessment_id:
        query = query.filter(Feature.assessment_id == assessment_id)
    if domain:
        query = query.filter(Feature.domain == domain)
    return query.all()

@router.post("/batch", response_model=List[FeatureOut], status_code=status.HTTP_201_CREATED)
def create_feature_batch(features_in: List[FeatureCreate], db: Session = Depends(get_db)):
    if not features_in:
        return []

    # Validate assessment exists
    assessment_id = features_in[0].assessment_id
    assessment = db.query(Assessment).filter(Assessment.id == assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    created_features = []
    for f in features_in:
        feat = Feature(
            assessment_id=f.assessment_id,
            domain=f.domain,
            feature_name=f.feature_name,
            value=f.value,
            unit=f.unit,
            confidence=f.confidence,
            is_simulated=f.is_simulated,
            raw_payload=f.raw_payload
        )
        db.add(feat)
        created_features.append(feat)

    db.commit()
    for feat in created_features:
        db.refresh(feat)

    return created_features
