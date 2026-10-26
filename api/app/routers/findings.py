from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.finding import Finding
from app.models.assessment import Assessment
from app.schemas.finding import FindingCreate, FindingOut

router = APIRouter(prefix="/findings", tags=["Findings"])

@router.get("", response_model=List[FindingOut])
def list_findings(assessment_id: Optional[str] = None, requires_review: Optional[bool] = None, db: Session = Depends(get_db)):
    query = db.query(Finding)
    if assessment_id:
        query = query.filter(Finding.assessment_id == assessment_id)
    if requires_review is not None:
        query = query.filter(Finding.requires_review == requires_review)
    return query.order_by(Finding.created_at.desc()).all()

@router.post("", response_model=FindingOut, status_code=status.HTTP_201_CREATED)
def create_finding(finding_in: FindingCreate, db: Session = Depends(get_db)):
    assessment = db.query(Assessment).filter(Assessment.id == finding_in.assessment_id).first()
    if not assessment:
        raise HTTPException(status_code=404, detail="Assessment not found")

    finding = Finding(
        assessment_id=finding_in.assessment_id,
        domain=finding_in.domain,
        finding_title=finding_in.finding_title,
        explanation=finding_in.explanation,
        evidence_metrics=finding_in.evidence_metrics,
        clinical_relevance=finding_in.clinical_relevance,
        requires_review=finding_in.requires_review,
        status=finding_in.status
    )
    db.add(finding)
    db.commit()
    db.refresh(finding)
    return finding

@router.patch("/{finding_id}/status", response_model=FindingOut)
def update_finding_status(finding_id: str, new_status: str, db: Session = Depends(get_db)):
    finding = db.query(Finding).filter(Finding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found")
    
    finding.status = new_status
    db.commit()
    db.refresh(finding)
    return finding
