from typing import List, Dict, Any, Optional
from pydantic import BaseModel

class TrajectoryPoint(BaseModel):
    assessment_id: str
    date: str
    feature_name: str
    value: float
    unit: str
    baseline_mean: Optional[float] = None
    baseline_std: Optional[float] = None
    deviation_sigmas: Optional[float] = None
    is_simulated: bool = False

class LongitudinalSummary(BaseModel):
    patient_id: str
    total_assessments: int
    domains_monitored: List[str]
    trajectory_points: List[TrajectoryPoint]
    overall_status: str
    advisory: str
