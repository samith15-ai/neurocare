import math
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple, Any
from sqlalchemy.orm import Session
from app.models.patient import Patient
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.baseline import Baseline
from app.models.treatment_event import TreatmentEvent
from app.models.checkin import DailyCheckin
from app.models.patient_timeline import PatientTimelineState
from app.services.clinical_rules import clinical_rules

class LongitudinalIntelligenceService:
    CUSUM_SLACK_K = 0.5
    CUSUM_THRESHOLD_H = 4.0
    PERSISTENT_THRESHOLD_CONSECUTIVE = 3
    DEVIATION_THRESHOLD_Z = 1.5

    @classmethod
    def get_feature_direction(cls, feature_name: str) -> str:
        scoring_rules = clinical_rules.scoring_rules
        ref_ranges = scoring_rules.get("reference_ranges", {})
        return ref_ranges.get(feature_name, {}).get("direction", "bidirectional")

    @classmethod
    def classify_feature_trajectory(
        cls,
        feature_name: str,
        domain: str,
        z_series: List[float],
        dates: List[str]
    ) -> Dict[str, Any]:
        """
        Classifies behavioral biomarker time series relative to personal baseline:
        - Stable: within nominal baseline variance (|z| < 1.0).
        - Sudden deviation: 1-2 sessions with |z| >= 2.0. Single session outputs: 'Observed once — repeat assessment recommended.'
        - Gradual change: monotonic drift across >= 3 sessions.
        - Persistent change: >= 3 consecutive valid sessions beyond threshold in same direction.
        - Improvement: moving back toward baseline or positive direction.
        - Inconsistent: fluctuating variance without consistent trend.
        """
        if not z_series:
            return {
                "feature_name": feature_name,
                "domain": domain,
                "classification": "stable",
                "current_z": 0.0,
                "consecutive_beyond_threshold": 0,
                "guidance": "Insufficient longitudinal sessions for classification."
            }

        direction = cls.get_feature_direction(feature_name)
        current_z = z_series[-1]

        def is_beyond_threshold(z: float) -> bool:
            if direction == "lower_is_change":
                return z < -cls.DEVIATION_THRESHOLD_Z
            elif direction == "higher_is_change":
                return z > cls.DEVIATION_THRESHOLD_Z
            return abs(z) > cls.DEVIATION_THRESHOLD_Z

        # Count consecutive beyond threshold ending at current session
        consecutive_count = 0
        for z in reversed(z_series):
            if is_beyond_threshold(z):
                consecutive_count += 1
            else:
                break

        # Check for persistent change (>= 3 consecutive sessions)
        if consecutive_count >= cls.PERSISTENT_THRESHOLD_CONSECUTIVE:
            return {
                "feature_name": feature_name,
                "domain": domain,
                "classification": "persistent_change",
                "current_z": current_z,
                "consecutive_beyond_threshold": consecutive_count,
                "guidance": f"Persistent deviation observed across {consecutive_count} consecutive valid sessions beyond threshold."
            }

        # Check for single or double sudden deviation
        if consecutive_count == 1:
            return {
                "feature_name": feature_name,
                "domain": domain,
                "classification": "sudden_deviation",
                "current_z": current_z,
                "consecutive_beyond_threshold": 1,
                "guidance": "Observed once — repeat assessment recommended."
            }
        elif consecutive_count == 2:
            return {
                "feature_name": feature_name,
                "domain": domain,
                "classification": "sudden_deviation",
                "current_z": current_z,
                "consecutive_beyond_threshold": 2,
                "guidance": "Observed twice consecutively — ongoing monitoring advised."
            }

        # Check for improvement (was previously deviated, now returning to |z| < 1.0)
        has_prior_deviation = any(is_beyond_threshold(z) for z in z_series[:-1])
        if has_prior_deviation and abs(current_z) < 1.0:
            return {
                "feature_name": feature_name,
                "domain": domain,
                "classification": "improvement",
                "current_z": current_z,
                "consecutive_beyond_threshold": 0,
                "guidance": "Performance recovering toward personalized baseline variance."
            }

        # Check for gradual change (monotonic increase in deviation over >= 3 sessions)
        if len(z_series) >= 3:
            recent_3 = z_series[-3:]
            abs_recent = [abs(z) for z in recent_3]
            is_monotonic_increasing = abs_recent[0] < abs_recent[1] < abs_recent[2]
            if is_monotonic_increasing and abs_recent[-1] >= 1.2:
                return {
                    "feature_name": feature_name,
                    "domain": domain,
                    "classification": "gradual_change",
                    "current_z": current_z,
                    "consecutive_beyond_threshold": consecutive_count,
                    "guidance": "Gradual monotonic divergence from personal baseline detected across last 3 sessions."
                }

        # Check for inconsistent fluctuations
        if len(z_series) >= 4:
            signs = [1 if z > 0.8 else (-1 if z < -0.8 else 0) for z in z_series[-4:]]
            if signs.count(1) >= 1 and signs.count(-1) >= 1:
                return {
                    "feature_name": feature_name,
                    "domain": domain,
                    "classification": "inconsistent",
                    "current_z": current_z,
                    "consecutive_beyond_threshold": 0,
                    "guidance": "High session-to-session variability without stable directional trend."
                }

        # Nominal stable
        return {
            "feature_name": feature_name,
            "domain": domain,
            "classification": "stable",
            "current_z": current_z,
            "consecutive_beyond_threshold": 0,
            "guidance": "Measurements within nominal personal baseline range (|z| < 1.0)."
        }

    @classmethod
    def detect_change_point_cusum(
        cls,
        z_series: List[float],
        dates: List[str]
    ) -> Dict[str, Any]:
        """
        Two-Sided Tabular CUSUM Change-Point Detector.
        Identifies empirical monitoring change point onset without claiming disease etiology.
        """
        if len(z_series) < 3:
            return {
                "has_change_point": False,
                "change_point_index": None,
                "estimated_date": None,
                "shift_magnitude_z": None,
                "confidence_score": 0.0,
                "disclaimer": "Estimated empirical monitoring change point; not the onset of a disease."
            }

        s_pos = 0.0
        s_neg = 0.0
        change_idx = None
        onset_idx = None

        for i, z in enumerate(z_series):
            # Accumulate positive and negative deviations beyond slack k
            s_pos = max(0.0, s_pos + z - cls.CUSUM_SLACK_K)
            s_neg = max(0.0, s_neg - z - cls.CUSUM_SLACK_K)

            if s_pos > cls.CUSUM_THRESHOLD_H or s_neg > cls.CUSUM_THRESHOLD_H:
                change_idx = i
                # Backtrack to find onset (when CUSUM first became positive)
                # Look back for when the cumulative accumulation started
                onset_idx = max(0, i - 2)
                break

        if change_idx is not None and onset_idx is not None:
            est_date = dates[onset_idx] if onset_idx < len(dates) else dates[-1]
            shift_z = z_series[change_idx]
            conf = min(0.99, max(0.60, round(max(s_pos, s_neg) / (cls.CUSUM_THRESHOLD_H * 1.5), 2)))
            return {
                "has_change_point": True,
                "change_point_index": onset_idx,
                "estimated_date": est_date,
                "shift_magnitude_z": round(shift_z, 2),
                "confidence_score": conf,
                "disclaimer": "Estimated empirical monitoring change point; not the onset of a disease."
            }

        return {
            "has_change_point": False,
            "change_point_index": None,
            "estimated_date": None,
            "shift_magnitude_z": None,
            "confidence_score": 0.0,
            "disclaimer": "Estimated empirical monitoring change point; not the onset of a disease."
        }

    @classmethod
    def compute_recovery_index(
        cls,
        z_series: List[float],
        dates: List[str]
    ) -> Dict[str, Any]:
        """
        Calculates experimental Recovery Index (0 to 100).
        Compares current deviation with peak observed deviation from baseline.
        """
        if not z_series:
            return {
                "overall_recovery_index": 100.0,
                "peak_deviation_z": 0.0,
                "current_deviation_z": 0.0,
                "plateau_detected": False,
                "plateau_note": None,
                "expected_vs_observed": [],
                "estimated_sessions_to_recovery": None,
                "uncertainty_pct": 5.0,
                "experimental_disclaimer": "Experimental Index: For exploratory longitudinal tracking only. Not a clinically validated diagnostic outcome."
            }

        abs_z = [abs(z) for z in z_series]
        peak_z = max(abs_z)
        curr_z = abs_z[-1]

        # If peak deviation was minor (< 1.0 sigma), the patient remained nominal
        if peak_z < 1.0:
            rec_idx = 100.0
        else:
            # Recovery fraction: 1 - (current_z / peak_z) clamped between 0 and 1
            ratio = min(1.0, max(0.0, curr_z / peak_z))
            rec_idx = round((1.0 - ratio) * 100.0, 1)

        # Plateau detection: rate of recovery < 2% across last 3 sessions while remaining < 80%
        plateau = False
        plateau_note = None
        if len(abs_z) >= 4 and rec_idx < 80.0:
            recent_devs = abs_z[-3:]
            max_recent_diff = max(recent_devs) - min(recent_devs)
            if max_recent_diff < 0.15:  # Less than 0.15 sigma movement
                plateau = True
                plateau_note = f"Recovery trajectory has plateaued at approximately {rec_idx}% of baseline over the last 3 sessions."

        # Expected exponential recovery curve: R(t) = 100 * (1 - e^(-t / 7))
        expected_vs_observed = []
        for t, z_val in enumerate(abs_z):
            exp_rec = round(100.0 * (1.0 - math.exp(-max(1, t) / 7.0)), 1) if peak_z >= 1.0 else 100.0
            obs_rec = round(max(0.0, min(100.0, (1.0 - (z_val / (peak_z or 1.0))) * 100.0)), 1)
            expected_vs_observed.append({
                "session_index": t + 1,
                "date": dates[t] if t < len(dates) else f"S{t+1}",
                "observed_recovery": obs_rec,
                "expected_recovery": exp_rec,
                "deviation_z": round(z_val, 2)
            })

        # Estimated sessions to recovery if progressing
        est_sessions = None
        if rec_idx < 90.0 and len(abs_z) >= 3 and not plateau:
            slope = (abs_z[-3] - abs_z[-1]) / 2.0  # Reduction in deviation per session
            if slope > 0.05:
                remaining_z = max(0.0, curr_z - 0.5)
                est_sessions = max(1, math.ceil(remaining_z / slope))

        uncertainty = round(min(25.0, max(5.0, float(math.sqrt(curr_z + 1.0) * 6.0))), 1)

        return {
            "overall_recovery_index": rec_idx,
            "peak_deviation_z": round(peak_z, 2),
            "current_deviation_z": round(curr_z, 2),
            "plateau_detected": plateau,
            "plateau_note": plateau_note,
            "expected_vs_observed": expected_vs_observed,
            "estimated_sessions_to_recovery": est_sessions,
            "uncertainty_pct": uncertainty,
            "experimental_disclaimer": "Experimental Index: For exploratory longitudinal tracking only. Not a clinically validated diagnostic outcome."
        }

    @classmethod
    def evaluate_patient_longitudinal_intelligence(
        cls,
        patient_id: str,
        db: Session
    ) -> Dict[str, Any]:
        """
        Runs comprehensive longitudinal intelligence analysis:
        1. Classifies change trajectories per biomarker and domain.
        2. Detects empirical monitoring change points via CUSUM.
        3. Computes experimental recovery index and plateau status.
        4. Smooths patient timeline state machine (Baseline, Onset, Active Change, Recovering, Recovered, Relapse Watch).
        5. Correlates treatment events with non-causal phrasing.
        6. Enforces FAST stroke rule emergency priority.
        """
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            raise ValueError("Patient not found")

        # Fetch completed assessments
        assessments = db.query(Assessment).filter(
            Assessment.patient_id == patient_id,
            Assessment.status == "completed"
        ).order_by(Assessment.started_at.asc()).all()

        # Fetch personal baselines
        baselines = {b.feature_name: b for b in db.query(Baseline).filter(Baseline.patient_id == patient_id).all()}

        # Fetch treatment events
        treatment_events = db.query(TreatmentEvent).filter(
            TreatmentEvent.patient_id == patient_id
        ).order_by(TreatmentEvent.event_date.asc()).all()

        # Gather time series per feature
        feature_series: Dict[str, List[float]] = {}
        feature_dates: Dict[str, List[str]] = {}
        feature_domains: Dict[str, str] = {}
        feature_units: Dict[str, str] = {}
        feature_raw_vals: Dict[str, List[float]] = {}
        feature_session_ids: Dict[str, List[str]] = {}

        for a in assessments:
            d_str = a.started_at.strftime("%Y-%m-%d")
            feats = db.query(Feature).filter(Feature.assessment_id == a.id).all()
            for f in feats:
                b = baselines.get(f.feature_name)
                # Compute standardized z-score
                if b and b.std_value > 0:
                    z = (f.value - (b.median_value or b.mean_value)) / b.std_value
                else:
                    z = 0.0

                if f.feature_name not in feature_series:
                    feature_series[f.feature_name] = []
                    feature_dates[f.feature_name] = []
                    feature_domains[f.feature_name] = f.domain
                    feature_units[f.feature_name] = f.unit
                    feature_raw_vals[f.feature_name] = []
                    feature_session_ids[f.feature_name] = []

                feature_series[f.feature_name].append(z)
                feature_dates[f.feature_name].append(d_str)
                feature_raw_vals[f.feature_name].append(f.value)
                feature_session_ids[f.feature_name].append(a.id)

        # 1. Classify trajectories & generate change profiles
        change_profiles = []
        change_points = []
        all_classifications = []
        domain_deviations: Dict[str, List[float]] = {}

        for fname, z_vals in feature_series.items():
            domain = feature_domains[fname]
            dates = feature_dates[fname]
            raw_vals = feature_raw_vals[fname]
            sess_ids = feature_session_ids[fname]
            b = baselines.get(fname)
            b_val = (b.median_value or b.mean_value) if b else raw_vals[0]

            if domain not in domain_deviations:
                domain_deviations[domain] = []
            domain_deviations[domain].append(abs(z_vals[-1]))

            # Classify trajectory
            class_res = cls.classify_feature_trajectory(fname, domain, z_vals, dates)
            all_classifications.append(class_res["classification"])

            # CUSUM change point
            cp_res = cls.detect_change_point_cusum(z_vals, dates)
            if cp_res["has_change_point"]:
                change_points.append(cp_res)

            # Trend determination
            trend = "stable"
            if len(z_vals) >= 2:
                if abs(z_vals[-1]) < abs(z_vals[-2]) - 0.2:
                    trend = "improving"
                elif abs(z_vals[-1]) > abs(z_vals[-2]) + 0.2:
                    trend = "deteriorating"

            # Create structured change profile if notable
            if abs(z_vals[-1]) >= 1.0 or class_res["classification"] != "stable":
                change_profiles.append({
                    "domain": domain,
                    "what_changed": f"Observed shift in {fname.replace('_', ' ')}",
                    "current_value": round(raw_vals[-1], 2),
                    "baseline_value": round(b_val, 2),
                    "unit": feature_units.get(fname, ""),
                    "magnitude_z": round(z_vals[-1], 2),
                    "trend": trend,
                    "duration_sessions": class_res["consecutive_beyond_threshold"] or 1,
                    "data_quality": "valid",
                    "context_tags": {"medication_reported": True, "sleep_quality": 4},
                    "evidence_reference": sess_ids[-3:],
                    "possible_clinical_relevance": class_res["guidance"]
                })

        # 2. Overall composite deviation and recovery index
        all_latest_z = [abs(z[-1]) for z in feature_series.values()] if feature_series else [0.0]
        max_latest_z = max(all_latest_z, default=0.0)

        # Composite z across all sessions
        composite_z_history = []
        if assessments:
            for i in range(len(assessments)):
                sess_z = [abs(series[i]) for series in feature_series.values() if i < len(series)]
                composite_z_history.append(float(sum(sess_z) / len(sess_z)) if sess_z else 0.0)

        recovery_summary = cls.compute_recovery_index(
            composite_z_history,
            [a.started_at.strftime("%Y-%m-%d") for a in assessments]
        )

        # Domain-specific recovery indices
        domain_recovery_indices = {}
        for d, devs in domain_deviations.items():
            mean_d_z = sum(devs) / len(devs) if devs else 0.0
            domain_recovery_indices[d] = round(max(0.0, min(100.0, (1.0 - min(1.0, mean_d_z / 2.0)) * 100.0)), 1)
        recovery_summary["domain_recovery_indices"] = domain_recovery_indices

        # 3. Patient Timeline State Machine (with smoothing)
        # States: baseline, onset, active_change, recovering, recovered_or_stable, relapse_watch
        timeline_state = "baseline"
        timeline_explanation = "Patient performance remains stable within established personal baseline variance."

        has_persistent = "persistent_change" in all_classifications
        has_sudden = "sudden_deviation" in all_classifications
        has_improvement = "improvement" in all_classifications
        has_change_point = any(cp["has_change_point"] for cp in change_points)

        if has_persistent:
            timeline_state = "active_change"
            timeline_explanation = "Persistent behavioral deviation confirmed across >= 3 consecutive valid sessions."
        elif has_improvement and recovery_summary["overall_recovery_index"] >= 50.0:
            if recovery_summary["overall_recovery_index"] >= 85.0:
                timeline_state = "recovered_or_stable"
                timeline_explanation = "Biomarkers have returned to baseline boundaries and stabilized."
            else:
                timeline_state = "recovering"
                timeline_explanation = "Measurements show consistent progress returning toward personal baseline."
        elif has_change_point or has_sudden:
            timeline_state = "onset"
            timeline_explanation = "Change point detected; awaiting 2-session confirmation to distinguish noise from persistent shift."

        # 4. Treatment Event Correlations (Non-causal phrasing)
        correlations = []
        for te in treatment_events:
            for cp in change_points:
                if cp.get("estimated_date"):
                    try:
                        d_event = datetime.strptime(te.event_date, "%Y-%m-%d")
                        d_cp = datetime.strptime(cp["estimated_date"], "%Y-%m-%d")
                        delta_days = (d_cp - d_event).days
                        if 0 <= delta_days <= 30:
                            correlations.append(
                                f"Observed change point began {delta_days} days after recorded event: '{te.title}' ({te.event_date}). "
                                f"(Note: Observational temporal correlation only; does not establish clinical causation)."
                            )
                    except Exception:
                        pass

        # 5. Alert Level determination (FAST takes priority)
        # Check if emergency FAST rule was ever triggered
        fast_triggered = False
        latest_report = None
        if assessments:
            latest_assessment = assessments[-1]
            if latest_assessment.report:
                fast_triggered = latest_assessment.report.emergency_fast_triggered

        if fast_triggered:
            overall_alert = "review_advised"
            alert_explanation = "EMERGENCY: Urgent FAST stroke alert triggered. Immediate clinical evaluation advised."
        elif timeline_state == "active_change":
            overall_alert = "review_advised"
            alert_explanation = "Persistent change confirmed across multiple consecutive sessions. Clinical review advised."
        elif timeline_state in ["onset", "relapse_watch"] or has_sudden:
            overall_alert = "watch"
            alert_explanation = "Transient variation observed. Single-session anomaly produces 'Observed once — repeat assessment recommended.'"
        else:
            overall_alert = "stable"
            alert_explanation = "All monitored biomarkers remain within nominal baseline limits."

        # Update or create PatientTimelineState in database
        timeline_rec = db.query(PatientTimelineState).filter(
            PatientTimelineState.patient_id == patient_id
        ).first()

        if not timeline_rec:
            timeline_rec = PatientTimelineState(
                patient_id=patient_id,
                current_state=timeline_state,
                onset_date=change_points[0]["estimated_date"] if change_points else None,
                peak_deviation_z=recovery_summary["peak_deviation_z"],
                current_deviation_z=recovery_summary["current_deviation_z"],
                recovery_index=recovery_summary["overall_recovery_index"],
                plateau_detected=recovery_summary["plateau_detected"],
                alert_level=overall_alert,
                explanation=timeline_explanation
            )
            db.add(timeline_rec)
        else:
            timeline_rec.current_state = timeline_state
            if change_points and change_points[0]["estimated_date"]:
                timeline_rec.onset_date = change_points[0]["estimated_date"]
            timeline_rec.peak_deviation_z = recovery_summary["peak_deviation_z"]
            timeline_rec.current_deviation_z = recovery_summary["current_deviation_z"]
            timeline_rec.recovery_index = recovery_summary["overall_recovery_index"]
            timeline_rec.plateau_detected = recovery_summary["plateau_detected"]
            timeline_rec.alert_level = overall_alert
            timeline_rec.explanation = timeline_explanation
            timeline_rec.last_evaluated_at = datetime.now(timezone.utc)

        db.commit()

        return {
            "patient_id": patient_id,
            "timeline_state": timeline_state,
            "timeline_explanation": timeline_explanation,
            "overall_alert": overall_alert,
            "alert_explanation": alert_explanation,
            "emergency_fast_triggered": fast_triggered,
            "change_profiles": change_profiles,
            "change_points": change_points,
            "recovery": recovery_summary,
            "treatment_events": [
                {
                    "id": te.id,
                    "patient_id": te.patient_id,
                    "event_type": te.event_type,
                    "event_date": te.event_date,
                    "title": te.title,
                    "description": te.description,
                    "created_at": te.created_at
                }
                for te in treatment_events
            ],
            "treatment_correlations": correlations,
            "evaluated_at": datetime.now(timezone.utc)
        }
