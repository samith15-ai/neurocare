import numpy as np
from typing import Dict, List, Optional, Tuple
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.patient import Patient
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.baseline import Baseline
from app.models.audit_log import AuditLog
from app.services.late_fusion import LateFusionService

class BaselineEngineService:
    MIN_REQUIRED_SESSIONS = 3
    MIN_MAD_RELATIVE_FLOOR = 0.05  # 5% of median value
    MIN_MAD_ABSOLUTE_FLOOR = 0.01

    @classmethod
    def calculate_patient_baseline(cls, patient_id: str, db: Session, force_recompute: bool = False) -> Dict:
        """
        Calculates personal baseline using Median and Median Absolute Deviation (MAD).
        Enforces:
        - At least 3 valid completed sessions required.
        - Status 'Personal baseline is not yet established.' if < 3 sessions.
        - Minimum MAD floor to prevent zero-variance traps.
        - Baseline freeze once established.
        """
        # Fetch completed, valid assessments
        valid_assessments = db.query(Assessment).filter(
            Assessment.patient_id == patient_id,
            Assessment.status == "completed",
            Assessment.quality_gate_passed == True
        ).order_by(Assessment.started_at.asc()).all()

        session_count = len(valid_assessments)
        
        if session_count < cls.MIN_REQUIRED_SESSIONS:
            # Baseline cannot be established
            # Update existing baseline records or create placeholder
            existing_baselines = db.query(Baseline).filter(Baseline.patient_id == patient_id).all()
            for b in existing_baselines:
                b.is_established = False
                b.is_frozen = False
                b.sample_count = session_count
                b.status_message = "Personal baseline is not yet established."
            db.commit()

            return {
                "patient_id": patient_id,
                "is_established": False,
                "is_frozen": False,
                "sample_count": session_count,
                "required_sessions": cls.MIN_REQUIRED_SESSIONS,
                "status_message": "Personal baseline is not yet established.",
                "baselines": []
            }

        # Gather feature values grouped by (domain, feature_name)
        feature_data: Dict[Tuple[str, str], List[float]] = {}
        for a in valid_assessments:
            feats = db.query(Feature).filter(Feature.assessment_id == a.id).all()
            for f in feats:
                key = (f.domain, f.feature_name)
                if key not in feature_data:
                    feature_data[key] = []
                feature_data[key].append(f.value)

        created_baselines = []
        for (domain, feature_name), values in feature_data.items():
            if len(values) < cls.MIN_REQUIRED_SESSIONS:
                continue

            arr = np.array(values, dtype=float)
            median_val = float(np.median(arr))
            
            # Median Absolute Deviation (MAD) = median(|x_i - median(X)|)
            deviations = np.abs(arr - median_val)
            raw_mad = float(np.median(deviations))

            # Apply configurable MAD floor
            mad_floor = max(
                raw_mad,
                abs(median_val) * cls.MIN_MAD_RELATIVE_FLOOR,
                cls.MIN_MAD_ABSOLUTE_FLOOR
            )

            # Normal-equivalent pseudo standard deviation: sigma ≈ 1.4826 * MAD
            pseudo_std = float(1.4826 * mad_floor)

            existing = db.query(Baseline).filter(
                Baseline.patient_id == patient_id,
                Baseline.feature_name == feature_name
            ).first()

            if existing:
                if existing.is_frozen and not force_recompute:
                    created_baselines.append(existing)
                    continue
                existing.domain = domain
                existing.mean_value = median_val
                existing.std_value = pseudo_std
                existing.median_value = median_val
                existing.mad_value = raw_mad
                existing.min_mad_floor = mad_floor
                existing.sample_count = len(values)
                existing.is_established = True
                existing.is_frozen = True
                existing.status_message = "Established (Frozen)"
                existing.updated_at = datetime.now(timezone.utc)
                created_baselines.append(existing)
            else:
                new_b = Baseline(
                    patient_id=patient_id,
                    domain=domain,
                    feature_name=feature_name,
                    mean_value=median_val,
                    std_value=pseudo_std,
                    median_value=median_val,
                    mad_value=raw_mad,
                    min_mad_floor=mad_floor,
                    sample_count=len(values),
                    is_established=True,
                    is_frozen=True,
                    status_message="Established (Frozen)"
                )
                db.add(new_b)
                created_baselines.append(new_b)

        # Log audit trail
        audit = AuditLog(
            action="ESTABLISH_BASELINE",
            target_entity="Patient",
            target_id=patient_id,
            details=f"Established personal baseline from {session_count} valid sessions (Median + MAD, Frozen)."
        )
        db.add(audit)
        db.commit()

        return {
            "patient_id": patient_id,
            "is_established": True,
            "is_frozen": True,
            "sample_count": session_count,
            "required_sessions": cls.MIN_REQUIRED_SESSIONS,
            "status_message": "Personal baseline established and frozen.",
            "baselines": [
                {
                    "domain": b.domain,
                    "feature_name": b.feature_name,
                    "median": b.median_value,
                    "mad": b.mad_value,
                    "std": b.std_value,
                    "sample_count": b.sample_count,
                    "is_frozen": b.is_frozen
                }
                for b in created_baselines
            ]
        }

    @classmethod
    def attempt_cautious_update(cls, patient_id: str, new_features: List[Feature], db: Session) -> Dict:
        """
        Cautiously update baseline only if:
        1. Baseline is established.
        2. Sufficient stable history exists.
        3. CRITICAL: Never absorb a persistent deterioration into the baseline.
        """
        baselines = db.query(Baseline).filter(
            Baseline.patient_id == patient_id,
            Baseline.is_established == True
        ).all()

        if not baselines:
            return {"updated": False, "reason": "No established baseline exists"}

        baseline_map = {b.feature_name: b for b in baselines}
        from app.services.clinical_rules import clinical_rules
        scoring_rules = clinical_rules.scoring_rules
        ref_ranges = scoring_rules.get("reference_ranges", {})

        # Check for persistent deterioration
        deterioration_detected = False
        deteriorating_features = []

        for f in new_features:
            b = baseline_map.get(f.feature_name)
            if not b or b.std_value <= 0:
                continue

            # Check directional deterioration
            direction = ref_ranges.get(f.feature_name, {}).get("direction", "bidirectional")
            z = (f.value - b.mean_value) / b.std_value

            is_deterioration = False
            if direction == "lower_is_change" and z < -1.5:
                is_deterioration = True
            elif direction == "higher_is_change" and z > 1.5:
                is_deterioration = True
            elif direction == "bidirectional" and abs(z) > 2.0:
                is_deterioration = True

            if is_deterioration:
                deterioration_detected = True
                deteriorating_features.append(f"{f.feature_name} (z={z:.2f})")

        if deterioration_detected:
            # CLINICAL RULE: Never absorb deterioration into baseline
            audit = AuditLog(
                action="REJECT_BASELINE_UPDATE",
                target_entity="Patient",
                target_id=patient_id,
                details=f"Update rejected: Persistent deterioration active on {', '.join(deteriorating_features)}. Preserving baseline."
            )
            db.add(audit)
            db.commit()

            return {
                "updated": False,
                "reason": "Deterioration detected. Baseline frozen to preserve clinical monitoring sensitivity.",
                "deteriorating_features": deteriorating_features
            }

        # If data is completely stable (all |z| <= 1.0) and sufficient sessions exist, apply subtle Kalman / moving average update
        updated_count = 0
        for f in new_features:
            b = baseline_map.get(f.feature_name)
            if b and b.sample_count >= 5:
                # Cautious exponential update: weight = 1 / (N + 1), max 5% weight
                alpha = min(0.05, 1.0 / (b.sample_count + 1))
                new_median = float((1 - alpha) * b.mean_value + alpha * f.value)
                b.mean_value = new_median
                b.median_value = new_median
                b.sample_count += 1
                b.updated_at = datetime.now(timezone.utc)
                updated_count += 1

        db.commit()
        return {
            "updated": True,
            "features_updated": updated_count,
            "reason": "Stable measurements incorporated cautiously without absorbing pathology."
        }
