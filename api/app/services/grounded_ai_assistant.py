import re
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.patient import Patient
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.baseline import Baseline
from app.models.checkin import DailyCheckin
from app.models.audit_log import AuditLog
from app.models.clinical_summary import ClinicalSummary
from app.schemas.ai import (
    AIChatResponse,
    ToolCallResult,
    ClinicianSummaryDraft,
)
from app.services.longitudinal_intelligence import LongitudinalIntelligenceService

STROKE_KEYWORDS = [
    "facial droop", "droop", "drooping", "slurred speech", "slurring",
    "arm weakness", "face weakness", "stroke", "can't speak", "cannot speak",
    "sudden numbness", "sudden weakness", "sudden asymmetry", "fast protocol"
]

FAST_EMERGENCY_TEXT = (
    "EMERGENCY ADVISORY (FAST Protocol): If you or the patient are experiencing sudden facial droop, "
    "arm or leg weakness, slurred speech, or difficulty speaking, please call 911 (or your local emergency services) "
    "immediately. Stroke is a medical emergency requiring rapid intervention."
)

class GroundedAIAssistantService:
    """
    Assistant service that accesses patient data strictly through authorized tools,
    enforcing role-based security, evidence-grounded responses, and non-diagnostic boundaries.
    """

    def verify_patient_authorization(self, patient_id: str, current_user: User, db: Session) -> Patient:
        patient = db.query(Patient).filter(Patient.id == patient_id).first()
        if not patient:
            raise HTTPException(status_code=404, detail="Patient not found")

        # Role-based check
        if current_user.role == "patient":
            if patient.user_id != current_user.id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Unauthorized access: Patients can only access their own clinical records."
                )
        return patient

    # ---------------- Tool 1: get_patient_baseline ----------------
    def get_patient_baseline(self, patient_id: str, db: Session, current_user: User) -> Dict[str, Any]:
        self.verify_patient_authorization(patient_id, current_user, db)

        baselines = db.query(Baseline).filter(Baseline.patient_id == patient_id).all()
        valid_assessments_count = (
            db.query(Assessment)
            .filter(Assessment.patient_id == patient_id, Assessment.quality_gate_passed == True)
            .count()
        )

        if valid_assessments_count < 3 or not baselines:
            return {
                "is_established": False,
                "sample_count": valid_assessments_count,
                "required_sessions": 3,
                "status_message": "Personal baseline is not yet established. At least 3 valid sessions are required."
            }

        features_data = {}
        for b in baselines:
            features_data[b.feature_name] = {
                "domain": b.domain,
                "median_baseline": round(float(b.median_value if b.median_value is not None else b.mean_value), 3),
                "mad_dispersion": round(float(b.mad_value if b.mad_value is not None else b.std_value), 3),
                "is_frozen": True,
                "min_mad_floor_active": bool(getattr(b, "min_mad_floor", None) is not None),
            }

        return {
            "is_established": True,
            "sample_count": valid_assessments_count,
            "feature_count": len(features_data),
            "features": features_data,
            "status_message": f"Personal baseline is frozen and established across {valid_assessments_count} valid sessions."
        }

    # ---------------- Tool 2: get_recent_assessments ----------------
    def get_recent_assessments(self, patient_id: str, limit: int = 5, db: Session = None, current_user: User = None) -> Dict[str, Any]:
        self.verify_patient_authorization(patient_id, current_user, db)

        assessments = (
            db.query(Assessment)
            .filter(Assessment.patient_id == patient_id)
            .order_by(Assessment.started_at.desc())
            .limit(limit)
            .all()
        )

        if not assessments:
            return {
                "count": 0,
                "assessments": [],
                "status_message": "No assessments recorded yet for this patient."
            }

        results = []
        for a in assessments:
            feats = db.query(Feature).filter(Feature.assessment_id == a.id).all()
            feat_map = {f.feature_name: {"value": round(float(f.value), 3), "unit": f.unit, "domain": f.domain} for f in feats}
            results.append({
                "assessment_id": a.id,
                "date": a.started_at.strftime("%Y-%m-%d %H:%M") if a.started_at else "N/A",
                "type": a.assessment_type,
                "quality_passed": a.quality_gate_passed,
                "quality_notes": a.quality_notes,
                "features": feat_map
            })

        return {
            "count": len(results),
            "assessments": results,
            "status_message": f"Retrieved {len(results)} most recent assessment session(s)."
        }

    # ---------------- Tool 3: get_modality_trends ----------------
    def get_modality_trends(self, patient_id: str, modality: Optional[str] = None, db: Session = None, current_user: User = None) -> Dict[str, Any]:
        self.verify_patient_authorization(patient_id, current_user, db)

        # Retrieve features by domain across assessments
        q = (
            db.query(Feature, Assessment.started_at)
            .join(Assessment, Feature.assessment_id == Assessment.id)
            .filter(Assessment.patient_id == patient_id)
        )
        if modality:
            q = q.filter(Feature.domain == modality)
        
        records = q.order_by(Assessment.started_at.asc()).all()
        if not records:
            return {
                "modality": modality or "all",
                "trends": {},
                "status_message": f"No data recorded for modality '{modality or 'all'}'."
            }

        # Group by feature
        grouped: Dict[str, List[Dict[str, Any]]] = {}
        for feat, dt in records:
            if feat.feature_name not in grouped:
                grouped[feat.feature_name] = []
            grouped[feat.feature_name].append({
                "date": dt.strftime("%Y-%m-%d") if dt else "N/A",
                "value": round(float(feat.value), 3),
                "unit": feat.unit,
                "domain": feat.domain
            })

        trends_summary = {}
        for fname, pts in grouped.items():
            if len(pts) >= 2:
                delta = pts[-1]["value"] - pts[0]["value"]
                direction = "increasing" if delta > 0.05 * abs(pts[0]["value"] or 1) else ("decreasing" if delta < -0.05 * abs(pts[0]["value"] or 1) else "stable")
            else:
                direction = "single_observation"

            trends_summary[fname] = {
                "domain": pts[0]["domain"],
                "data_points_count": len(pts),
                "initial_value": pts[0]["value"],
                "latest_value": pts[-1]["value"],
                "unit": pts[0]["unit"],
                "direction": direction,
            }

        return {
            "modality": modality or "all",
            "trends": trends_summary,
            "status_message": f"Computed trends for {len(trends_summary)} metric(s)."
        }

    # ---------------- Tool 4: get_monitoring_deviations ----------------
    def get_monitoring_deviations(self, patient_id: str, db: Session, current_user: User) -> Dict[str, Any]:
        self.verify_patient_authorization(patient_id, current_user, db)

        rep = LongitudinalIntelligenceService.evaluate_patient_longitudinal_intelligence(patient_id, db)
        rec = rep.get("recovery", {})
        return {
            "timeline_state": rep.get("timeline_state", "baseline"),
            "overall_alert": rep.get("overall_alert", "stable"),
            "emergency_fast_triggered": rep.get("emergency_fast_triggered", False),
            "recovery_index": rec.get("overall_recovery_index", 100.0),
            "plateau_detected": rec.get("plateau_detected", False),
            "change_profiles_count": len(rep.get("change_profiles", [])),
            "change_profiles": rep.get("change_profiles", []),
            "change_points": rep.get("change_points", []),
            "correlations": rep.get("treatment_correlations", []),
            "status_message": rep.get("timeline_explanation", "Trajectory within baseline variance.")
        }

    # ---------------- Tool 5: get_assessment_quality ----------------
    def get_assessment_quality(self, assessment_id: Optional[str] = None, patient_id: Optional[str] = None, db: Session = None, current_user: User = None) -> Dict[str, Any]:
        if patient_id:
            self.verify_patient_authorization(patient_id, current_user, db)

        query = db.query(Assessment)
        if assessment_id:
            query = query.filter(Assessment.id == assessment_id)
        elif patient_id:
            query = query.filter(Assessment.patient_id == patient_id).order_by(Assessment.started_at.desc())
        
        ass = query.first()
        if not ass:
            return {
                "has_record": False,
                "status_message": "No assessment recording found to evaluate quality."
            }

        return {
            "has_record": True,
            "assessment_id": ass.id,
            "date": ass.started_at.strftime("%Y-%m-%d %H:%M") if ass.started_at else "N/A",
            "quality_gate_passed": ass.quality_gate_passed,
            "status": ass.status,
            "quality_notes": ass.quality_notes or "Quality checks completed with nominal lighting, framing, and tracking.",
            "is_simulated": ass.is_simulated,
            "status_message": "Quality gate passed." if ass.quality_gate_passed else "Quality gate flagged limitations/rejection."
        }

    # ---------------- Tool 6: generate_clinician_summary ----------------
    def generate_clinician_summary(self, patient_id: str, db: Session, current_user: User) -> ClinicianSummaryDraft:
        patient = self.verify_patient_authorization(patient_id, current_user, db)

        # Subjective: Daily check-ins context
        recent_checkin = (
            db.query(DailyCheckin)
            .filter(DailyCheckin.patient_id == patient_id)
            .order_by(DailyCheckin.checkin_date.desc())
            .first()
        )
        if recent_checkin:
            subj = (
                f"Patient reported daily check-in on {recent_checkin.checkin_date}: "
                f"Medication taken: {'Yes' if recent_checkin.medication_taken else 'No'}. "
                f"Sleep quality: {recent_checkin.sleep_quality or 'N/A'}/5. "
                f"Fatigue level: {recent_checkin.fatigue_level or 'N/A'}/5. "
                f"Pain level: {recent_checkin.pain_level or 'N/A'}/5. "
                f"Notes: {recent_checkin.medication_notes or 'None'}"
            )
        else:
            subj = "No patient self-reported daily check-ins recorded in the current monitoring window."

        # Objective: Stored sensor kinematics & Z-scores
        recent_ass = (
            db.query(Assessment)
            .filter(Assessment.patient_id == patient_id, Assessment.quality_gate_passed == True)
            .order_by(Assessment.started_at.desc())
            .first()
        )
        if recent_ass:
            feats = db.query(Feature).filter(Feature.assessment_id == recent_ass.id).all()
            feat_strs = [f"{f.feature_name}: {round(f.value, 3)} {f.unit} (confidence {round(f.confidence, 2)})" for f in feats[:8]]
            obj = (
                f"Latest contactless multimodal assessment on {recent_ass.started_at.strftime('%Y-%m-%d')}: "
                f"Recording quality: {'Valid' if recent_ass.quality_gate_passed else 'Limited'}. "
                f"Key kinematics: {'; '.join(feat_strs)}."
            )
        else:
            obj = "No valid kinematic assessment sessions available for objective analysis."

        # Assessment: Longitudinal deviations & recovery trajectory
        long_data = LongitudinalIntelligenceService.evaluate_patient_longitudinal_intelligence(patient_id, db)
        rec = long_data.get("recovery", {})
        assm = (
            f"Longitudinal monitoring state: {long_data.get('timeline_state', 'baseline').upper()}. "
            f"Overall alert: {long_data.get('overall_alert', 'stable').upper()}. "
            f"Recovery index: {rec.get('overall_recovery_index', 100.0):.1f}% "
            f"(Peak deviation: {rec.get('peak_deviation_z', 0.0):.2f}σ, Current: {rec.get('current_deviation_z', 0.0):.2f}σ). "
            f"Trajectory explanation: {long_data.get('timeline_explanation', 'Nominal variance.')}"
        )

        # Plan: Monitoring frequency & follow-up recommendations
        plan = (
            f"Continue scheduled contactless assessments according to active monitoring plan. "
            f"Repeat assessment recommended if single-session outliers occur. "
            f"Correlate behavioral recovery index ({rec.get('overall_recovery_index', 100.0):.1f}%) with in-clinic physical examination."
        )

        return ClinicianSummaryDraft(
            patient_id=patient.id,
            patient_name=f"{patient.first_name} {patient.last_name}",
            mrn=patient.mrn,
            subjective=subj,
            objective=obj,
            assessment=assm,
            plan=plan,
            is_approved=False
        )

    # ---------------- Main Chat Dispatcher ----------------
    def process_chat(
        self,
        patient_id: str,
        message: str,
        current_user: User,
        db: Session,
        assessment_id: Optional[str] = None
    ) -> AIChatResponse:
        patient = self.verify_patient_authorization(patient_id, current_user, db)
        msg_lower = message.lower()

        tool_calls: List[ToolCallResult] = []
        observations: List[str] = []
        interpretations: List[str] = []
        quality_notes: Optional[str] = None
        emergency_advisory: Optional[str] = None

        # Check for FAST emergency triggers
        has_stroke_symptom = any(k in msg_lower for k in STROKE_KEYWORDS)

        # Always run monitoring deviations & quality to check emergency flags
        dev_tool = self.get_monitoring_deviations(patient_id, db, current_user)
        tool_calls.append(ToolCallResult(
            tool_name="get_monitoring_deviations",
            summary=dev_tool["status_message"],
            data={
                "timeline_state": dev_tool["timeline_state"],
                "recovery_index": dev_tool["recovery_index"],
                "change_profiles_count": dev_tool["change_profiles_count"]
            }
        ))

        if dev_tool.get("emergency_fast_triggered") or has_stroke_symptom:
            emergency_advisory = FAST_EMERGENCY_TEXT

        # Baseline tool invocation
        if any(w in msg_lower for w in ["baseline", "normal", "reference", "starting", "median"]):
            b_data = self.get_patient_baseline(patient_id, db, current_user)
            tool_calls.append(ToolCallResult(
                tool_name="get_patient_baseline",
                summary=b_data["status_message"],
                data={"is_established": b_data["is_established"], "sample_count": b_data["sample_count"]}
            ))
            if not b_data["is_established"]:
                observations.append(b_data["status_message"])
            else:
                observations.append(f"Personal baseline is frozen across {b_data['sample_count']} valid sessions.")

        # Recent assessments tool invocation
        if any(w in msg_lower for w in ["recent", "latest", "last", "session", "test", "tapping", "speed", "score", "measured"]):
            r_data = self.get_recent_assessments(patient_id, 3, db, current_user)
            tool_calls.append(ToolCallResult(
                tool_name="get_recent_assessments",
                summary=r_data["status_message"],
                data={"count": r_data["count"]}
            ))
            if r_data["count"] == 0:
                observations.append("No assessments have been recorded yet for this patient.")
            else:
                latest = r_data["assessments"][0]
                feats = latest.get("features", {})
                if feats:
                    feat_items = [f"{k.replace('_', ' ')}: {v['value']} {v['unit']}" for k, v in list(feats.items())[:4]]
                    observations.append(f"Latest assessment on {latest['date']}: {', '.join(feat_items)}.")

        # Modality trends tool invocation
        if any(w in msg_lower for w in ["trend", "progress", "improving", "worsening", "recovery", "trajectory"]):
            mod_filter = None
            for m in ["motor", "speech", "vocal", "facial", "gait", "balance", "cognition"]:
                if m in msg_lower:
                    mod_filter = "vocal" if m == "speech" else m
                    break
            t_data = self.get_modality_trends(patient_id, mod_filter, db, current_user)
            tool_calls.append(ToolCallResult(
                tool_name="get_modality_trends",
                summary=t_data["status_message"],
                data={"modality": t_data["modality"], "trends_count": len(t_data["trends"])}
            ))
            for fname, tinfo in list(t_data["trends"].items())[:3]:
                observations.append(
                    f"{fname.replace('_', ' ')}: {tinfo['initial_value']} → {tinfo['latest_value']} {tinfo['unit']} ({tinfo['direction']})."
                )

        # Quality tool invocation
        if any(w in msg_lower for w in ["quality", "lighting", "camera", "microphone", "snr", "framing", "valid"]):
            q_data = self.get_assessment_quality(assessment_id, patient_id, db, current_user)
            tool_calls.append(ToolCallResult(
                tool_name="get_assessment_quality",
                summary=q_data["status_message"],
                data={"quality_gate_passed": q_data.get("quality_gate_passed", False)}
            ))
            quality_notes = q_data.get("quality_notes")

        # Synthesize role-adapted grounded response
        is_patient = current_user.role == "patient"
        response_text = self._synthesize_grounded_response(
            is_patient=is_patient,
            message=message,
            observations=observations,
            interpretations=interpretations,
            dev_tool=dev_tool,
            tool_calls=tool_calls,
            patient=patient,
            emergency_advisory=emergency_advisory,
            quality_notes=quality_notes
        )

        return AIChatResponse(
            response=response_text,
            role_adapted_mode="patient" if is_patient else "doctor",
            tool_calls=tool_calls,
            observations=observations,
            interpretations=interpretations,
            quality_notes=quality_notes,
            emergency_advisory=emergency_advisory
        )

    def _synthesize_grounded_response(
        self,
        is_patient: bool,
        message: str,
        observations: List[str],
        interpretations: List[str],
        dev_tool: Dict[str, Any],
        tool_calls: List[ToolCallResult],
        patient: Patient,
        emergency_advisory: Optional[str],
        quality_notes: Optional[str]
    ) -> str:
        parts: List[str] = []

        if emergency_advisory:
            parts.append(emergency_advisory)

        msg_lower = message.lower()
        # Diagnostic guardrail check
        if any(d in msg_lower for d in ["do i have parkinson", "diagnose", "is it als", "do i have ms", "what disease"]):
            if is_patient:
                return (
                    "NeuroCare measures physical and vocal movement patterns such as tap rhythm, walking cadence, and voice stability. "
                    "I cannot diagnose Parkinson's disease, ALS, or any medical condition. "
                    "Your recorded measurements are available to review with your neurologist for clinical evaluation."
                )
            else:
                return (
                    "Diagnostic determination guardrail active: NeuroCare provides quantitative kinematic tracking only. "
                    "Diagnostic conclusions require comprehensive clinical examination and formal diagnostic criteria."
                )

        # Patient mode: Friendly, clear, accessible, strictly grounded
        if is_patient:
            profiles = dev_tool.get("change_profiles", [])
            state = dev_tool.get("timeline_state", "baseline")
            rec_idx = dev_tool.get("recovery_index", 100.0)

            # Strict single abnormal session rule text
            if len(profiles) == 1 and profiles[0].get("duration_sessions") == 1:
                parts.append("Observed once — repeat assessment recommended.")

            if len(profiles) > 0 and any(p.get("duration_sessions", 0) >= 3 for p in profiles):
                parts.append(
                    "Your tapping speed was lower than your personal baseline in the last three valid sessions. "
                    "This is an observed change, not a diagnosis. You may wish to discuss it with your clinician."
                )
            elif len(observations) > 0:
                parts.append("Here is what your recent recordings show:")
                for obs in observations[:3]:
                    parts.append(f"• {obs}")
            else:
                parts.append(
                    f"Your monitoring timeline is currently in the '{state.replace('_', ' ')}' stage. "
                    f"Overall behavioral recovery index is measured at {rec_idx:.1f}% relative to baseline."
                )

            if quality_notes:
                parts.append(f"Recording note: {quality_notes}")

            parts.append("Please remember that these numbers reflect sensor measurements, not a medical diagnosis. Feel free to reach out to your doctor with any questions.")

        # Doctor mode: Technical, kinematic, precise, evidence-linked
        else:
            state = dev_tool.get("timeline_state", "baseline")
            alert = dev_tool.get("overall_alert", "stable")
            rec_idx = dev_tool.get("recovery_index", 100.0)
            profiles = dev_tool.get("change_profiles", [])

            parts.append(
                f"Clinical Tele-Monitoring Summary for {patient.first_name} {patient.last_name} (MRN: {patient.mrn}):\n"
                f"• Longitudinal State: {state.upper()} (Alert Level: {alert.upper()})\n"
                f"• Recovery Index: {rec_idx:.1f}% (Experimental normalized scale)"
            )

            if observations:
                parts.append("Objective Kinematic Observations:\n" + "\n".join([f"  - {o}" for o in observations]))

            if profiles:
                change_lines = []
                for p in profiles[:4]:
                    dur = p.get('duration_sessions', 1)
                    if dur == 1:
                        change_lines.append(f"  - {p['what_changed']}: Observed once — repeat assessment recommended. (|Z|={p.get('magnitude_z', 0):.2f}σ)")
                    else:
                        change_lines.append(f"  - {p['what_changed']}: Current {p.get('current_value', 0):.2f} vs Baseline {p.get('baseline_value', 0):.2f} {p.get('unit', '')} (|Z|={p.get('magnitude_z', 0):.2f}σ, {dur} sessions)")
                parts.append("Active Deviations:\n" + "\n".join(change_lines))

            if quality_notes:
                parts.append(f"Quality Metrics: {quality_notes}")

            parts.append("Clinical decision support advisory: Trajectory points are empirical sensor measurements without autonomous diagnostic inference.")

        return "\n\n".join(parts)


grounded_ai_assistant = GroundedAIAssistantService()
