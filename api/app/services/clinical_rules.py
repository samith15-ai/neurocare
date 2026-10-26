import json
import os
from typing import Dict, Any, List, Optional
from app.core.config import settings

class ClinicalRulesService:
    def __init__(self):
        self.thresholds = self._load_json(settings.CLINICAL_CONFIG_PATH)
        self.scoring_rules = self._load_json(settings.SCORING_RULES_PATH)

    def _load_json(self, path: str) -> Dict[str, Any]:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        return {}

    def check_quality_gate(
        self,
        luma: float,
        face_confidence: float,
        posture_confidence: float,
        audio_snr_db: float
    ) -> Dict[str, Any]:
        q_thresh = self.thresholds.get("quality_gate_thresholds", {})
        
        # Rule: Quality is not pathology!
        lighting_thresh = q_thresh.get("lighting", {}).get("min_luma_percentile", 20.0)
        face_thresh = q_thresh.get("facial_visibility", {}).get("min_face_detection_confidence", 0.70)
        posture_thresh = q_thresh.get("postural_framing", {}).get("min_shoulder_visibility_confidence", 0.65)
        audio_thresh = q_thresh.get("audio_snr", {}).get("min_snr_db", 14.0)

        issues = []
        if luma < lighting_thresh:
            issues.append(q_thresh.get("lighting", {}).get("instruction", "Insufficient lighting"))
        if face_confidence < face_thresh:
            issues.append(q_thresh.get("facial_visibility", {}).get("instruction", "Face occluded or angled"))
        if posture_confidence < posture_thresh:
            issues.append(q_thresh.get("postural_framing", {}).get("instruction", "Framing improper"))
        if audio_snr_db < audio_thresh:
            issues.append(q_thresh.get("audio_snr", {}).get("instruction", "High background noise"))

        passed = len(issues) == 0
        return {
            "passed": passed,
            "lighting_ok": luma >= lighting_thresh,
            "face_ok": face_confidence >= face_thresh,
            "posture_ok": posture_confidence >= posture_thresh,
            "audio_ok": audio_snr_db >= audio_thresh,
            "rejection_code": "INSUFFICIENT_RECORDING_QUALITY" if not passed else None,
            "guidance": "; ".join(issues) if issues else "All quality gates satisfied."
        }

    def check_emergency_fast(self, features: Dict[str, float]) -> Dict[str, Any]:
        """
        FAST Protocol:
        F - Facial Asymmetry
        A - Arm weakness / Pronator drift
        S - Speech dysarthria
        T - Time to call 911 immediately
        """
        fast_cfg = self.thresholds.get("emergency_fast_protocol", {})
        triggers = fast_cfg.get("triggers", {})

        face_drop = features.get("facial_asymmetry_ratio", 0.0)
        arm_drift = features.get("arm_pronator_drift_deg", 0.0)
        speech_dys = features.get("speech_dysarthria_index", 0.0)

        face_triggered = face_drop >= triggers.get("facial_asymmetry_drop_ratio", 0.45)
        arm_triggered = arm_drift >= triggers.get("unilateral_arm_pronator_drift_deg", 18.0)
        speech_triggered = speech_dys >= triggers.get("acute_speech_dysarthria_index", 0.80)

        is_emergency = face_triggered or arm_triggered or speech_triggered
        details = []
        if face_triggered:
            details.append(f"Significant acute facial asymmetry ratio ({face_drop:.2f})")
        if arm_triggered:
            details.append(f"Acute unilateral arm pronator drift ({arm_drift:.1f}°)")
        if speech_triggered:
            details.append(f"Severe speech cadence/prosody disturbance ({speech_dys:.2f})")

        return {
            "emergency_triggered": is_emergency,
            "banner_text": fast_cfg.get("banner_text", settings.EMERGENCY_ADVISORY_MESSAGE) if is_emergency else None,
            "details": "; ".join(details) if is_emergency else None,
            "action_url": fast_cfg.get("action_url", "tel:911")
        }

    def sanitize_clinical_language(self, text: str) -> str:
        """
        Enforce Medical Safety Rule:
        Never diagnose diseases, claim missed symptoms, or output arbitrary disease probabilities.
        """
        prohibited = self.scoring_rules.get("prohibited_terminology", [])
        sanitized = text
        for term in prohibited:
            if term.lower() in sanitized.lower():
                sanitized = sanitized.replace(term, "[clinical finding]")
        return sanitized

clinical_rules = ClinicalRulesService()
