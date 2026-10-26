from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, ConfigDict

class ChangeClassificationOut(BaseModel):
    feature_name: str
    domain: str
    classification: str  # stable, sudden_deviation, gradual_change, persistent_change, improvement, inconsistent
    current_z: float
    consecutive_beyond_threshold: int
    guidance: str

class ChangePointOut(BaseModel):
    has_change_point: bool
    change_point_index: Optional[int] = None
    estimated_date: Optional[str] = None
    shift_magnitude_z: Optional[float] = None
    confidence_score: float = 0.0
    disclaimer: str = "Estimated empirical monitoring change point; not the onset of a disease."

class NeurologicalChangeProfile(BaseModel):
    domain: str
    what_changed: str
    current_value: float
    baseline_value: float
    unit: str
    magnitude_z: float
    trend: str  # improving, deteriorating, stable, inconsistent
    duration_sessions: int
    data_quality: str
    context_tags: Dict[str, Any]
    evidence_reference: List[str]
    possible_clinical_relevance: str

class RecoveryTrackingOut(BaseModel):
    overall_recovery_index: float  # 0 to 100
    domain_recovery_indices: Dict[str, float]
    peak_deviation_z: float
    current_deviation_z: float
    plateau_detected: bool
    plateau_note: Optional[str] = None
    expected_vs_observed: List[Dict[str, Any]]
    estimated_sessions_to_recovery: Optional[int] = None
    uncertainty_pct: float
    experimental_disclaimer: str = (
      "Experimental Index: For exploratory longitudinal visualization only. "
      "Not a clinically validated diagnostic outcome or recovery prognosis."
    )

class TreatmentEventCreate(BaseModel):
    patient_id: str
    event_type: str  # medication_change, therapy_session, surgery, lifestyle, other
    event_date: str  # YYYY-MM-DD
    title: str
    description: Optional[str] = None

class TreatmentEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    patient_id: str
    logged_by: Optional[str] = None
    event_type: str
    event_date: str
    title: str
    description: Optional[str] = None
    created_at: datetime

class LongitudinalIntelligenceReport(BaseModel):
    patient_id: str
    timeline_state: str  # baseline, onset, active_change, recovering, recovered_or_stable, relapse_watch
    timeline_explanation: str
    overall_alert: str  # stable, watch, review_advised
    alert_explanation: str
    emergency_fast_triggered: bool
    change_profiles: List[NeurologicalChangeProfile]
    change_points: List[ChangePointOut]
    recovery: RecoveryTrackingOut
    treatment_events: List[TreatmentEventOut]
    treatment_correlations: List[str]
    evaluated_at: datetime
