from typing import Dict, Any, List, Optional
import math
from app.services.clinical_rules import clinical_rules

class LateFusionService:
    def __init__(self):
        self.weights = clinical_rules.scoring_rules.get("late_fusion_weights", {
            "facial_expressivity_weight": 0.30,
            "motor_kinematics_weight": 0.40,
            "vocal_acoustics_weight": 0.30
        })

    def calculate_multimodal_index(
        self,
        facial_deviation: Optional[float],
        motor_deviation: Optional[float],
        vocal_deviation: Optional[float]
    ) -> Dict[str, Any]:
        """
        Interpretable late fusion:
        Aggregates normalized z-score deviations across available modalities.
        Rule: Unavailable beats invented. Missing is not abnormal.
        """
        active_weights = {}
        values = {}

        if facial_deviation is not None:
            active_weights["facial"] = self.weights.get("facial_expressivity_weight", 0.3)
            values["facial"] = abs(facial_deviation)
        if motor_deviation is not None:
            active_weights["motor"] = self.weights.get("motor_kinematics_weight", 0.4)
            values["motor"] = abs(motor_deviation)
        if vocal_deviation is not None:
            active_weights["vocal"] = self.weights.get("vocal_acoustics_weight", 0.3)
            values["vocal"] = abs(vocal_deviation)

        total_active_weight = sum(active_weights.values())
        if total_active_weight == 0:
            return {
                "composite_deviation_score": None,
                "status_label": "Not assessed / Insufficient recording quality",
                "severity": "neutral",
                "traceability": "No validated multimodal channels available."
            }

        # Normalize weights
        composite_score = sum(
            values[k] * (active_weights[k] / total_active_weight) for k in active_weights
        )

        # Interpretable mapping
        if composite_score < 1.0:
            status = "Nominal / Stable compared to baseline"
            severity = "low"
        elif composite_score < 2.0:
            status = "Observed mild variation from baseline"
            severity = "moderate"
        else:
            status = "Observed change - May warrant clinical review"
            severity = "high"

        return {
            "composite_deviation_score": round(composite_score, 2),
            "status_label": status,
            "severity": severity,
            "contributing_modalities": list(active_weights.keys()),
            "traceability": f"Computed using late fusion across {list(active_weights.keys())}."
        }

late_fusion = LateFusionService()
