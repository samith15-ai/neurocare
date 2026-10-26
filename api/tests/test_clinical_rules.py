import pytest
from app.services.clinical_rules import clinical_rules
from app.services.late_fusion import late_fusion

def test_quality_gate_rejects_insufficient_lighting():
    # Quality is not pathology: poor lighting must fail quality check without pathology
    result = clinical_rules.check_quality_gate(
        luma=10.0, # Below 20.0
        face_confidence=0.90,
        posture_confidence=0.85,
        audio_snr_db=25.0
    )
    assert result["passed"] is False
    assert result["lighting_ok"] is False
    assert result["rejection_code"] == "INSUFFICIENT_RECORDING_QUALITY"

def test_quality_gate_passes_nominal_conditions():
    result = clinical_rules.check_quality_gate(
        luma=55.0,
        face_confidence=0.88,
        posture_confidence=0.80,
        audio_snr_db=24.0
    )
    assert result["passed"] is True
    assert result["rejection_code"] is None

def test_emergency_fast_protocol_triggers():
    # FAST: acute unilateral asymmetry
    result = clinical_rules.check_emergency_fast({
        "facial_asymmetry_ratio": 0.52, # Above 0.45 trigger
        "arm_pronator_drift_deg": 5.0,
        "speech_dysarthria_index": 0.2
    })
    assert result["emergency_triggered"] is True
    assert "facial asymmetry" in result["details"].lower()
    assert result["action_url"] == "tel:911"

def test_emergency_fast_nominal():
    result = clinical_rules.check_emergency_fast({
        "facial_asymmetry_ratio": 0.08,
        "arm_pronator_drift_deg": 2.0,
        "speech_dysarthria_index": 0.1
    })
    assert result["emergency_triggered"] is False
    assert result["banner_text"] is None

def test_late_fusion_missing_channels_does_not_invent():
    # Rule: Unavailable beats invented. Missing is not abnormal.
    result = late_fusion.calculate_multimodal_index(
        facial_deviation=0.2,
        motor_deviation=None,
        vocal_deviation=None
    )
    assert result["composite_deviation_score"] == 0.2
    assert result["contributing_modalities"] == ["facial"]
    assert "motor" not in result["contributing_modalities"]
