import pytest
import json
from app.services.late_fusion import late_fusion
from app.models.patient import Patient
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.report import Report

def test_directional_z_scores():
    # Lower is change: tap_frequency (mean=4.5, sd=0.8)
    # Slow tapping: 2.1 Hz -> z = (2.1 - 4.5)/0.8 = -3.0
    res = late_fusion.compute_feature_z_score("finger_tap_frequency_hz", 2.1)
    assert res is not None
    assert res["z_score"] == -3.0
    assert res["deviation_magnitude"] == 3.0
    assert res["direction"] == "lower_is_change"

    # Higher is change: rhythm CV (mean=0.12, sd=0.04)
    # Irregular rhythm: 0.28 -> z = (0.28 - 0.12)/0.04 = +4.0
    res_cv = late_fusion.compute_feature_z_score("finger_tap_interval_cv", 0.28)
    assert res_cv is not None
    assert res_cv["z_score"] == 4.0
    assert res_cv["direction"] == "higher_is_change"

def test_missing_modalities_do_not_inflate_scores():
    # Only motor metrics provided; speech and facial are missing
    features = [
        {"feature_name": "finger_tap_frequency_hz", "value": 4.5}, # normal (z=0)
        {"feature_name": "finger_tap_mean_amplitude", "value": 1.2} # normal (z=0)
    ]
    fusion = late_fusion.calculate_multimodal_assessment(features, quality_status="valid")
    assert fusion["overall_status"] == "No flag"
    assert fusion["domain_scores"]["motor"] is not None
    assert fusion["domain_scores"]["speech"] is None
    assert fusion["domain_scores"]["facial"] is None
    assert fusion["domain_scores"]["gait"] is None
    # Motor normal -> composite deviation should be ~0.0
    assert fusion["composite_deviation_score"] == 0.0

def test_insufficient_quality_gate_safeguard():
    # Even if numbers deviate wildly, insufficient quality NEVER generates findings
    features = [
        {"feature_name": "finger_tap_frequency_hz", "value": 0.5},
        {"feature_name": "facial_asymmetry_ratio", "value": 0.45}
    ]
    fusion = late_fusion.calculate_multimodal_assessment(features, quality_status="insufficient")
    assert fusion["overall_status"] == "No flag"
    assert len(fusion["patterns"]) == 0
    assert "Insufficient recording quality" in fusion["summary"]

def test_slowness_with_reduced_amplitude_pattern():
    # Low frequency (<= -1.5 SD) and reduced amplitude (<= -1.5 SD)
    features_map = {
        "right_finger_tap_frequency_hz": 2.2,  # mean 3.4, sd 0.55 -> z = -2.18
        "right_finger_tap_mean_amplitude": 0.6  # mean 1.10, sd 0.20 -> z = -2.50
    }
    z_map = {
        "right_finger_tap_frequency_hz": -2.18,
        "right_finger_tap_mean_amplitude": -2.50
    }
    patterns = late_fusion.evaluate_pattern_rules(features_map, z_map, quality_status="valid")
    
    rule_ids = [p["rule_id"] for p in patterns]
    assert "RULE_SLOWNESS_REDUCED_AMPLITUDE" in rule_ids
    pattern = next(p for p in patterns if p["rule_id"] == "RULE_SLOWNESS_REDUCED_AMPLITUDE")
    assert "right_finger_tap_frequency_hz" in pattern["triggering_features"]
    assert "right_finger_tap_mean_amplitude" in pattern["triggering_features"]
    assert pattern["actual_values"]["right_finger_tap_frequency_hz"] == 2.2

def test_multimodal_coordination_safeguard():
    # Single-domain deviation (motor rhythm CV only) must NOT trigger multimodal coordination
    features_map_single = {
        "finger_tap_interval_cv": 0.25, # high motor irregularity
        "ddk_regularity_score": 0.90    # normal speech
    }
    z_map_single = {
        "finger_tap_interval_cv": 3.25,
        "ddk_regularity_score": 0.0
    }
    patterns_single = late_fusion.evaluate_pattern_rules(features_map_single, z_map_single, quality_status="valid")
    single_rule_ids = [p["rule_id"] for p in patterns_single]
    assert "RULE_COORDINATION_MULTIMODAL" not in single_rule_ids

    # Multimodal deviation: both motor rhythm CV AND speech ddk regularity deviate
    features_map_multi = {
        "finger_tap_interval_cv": 0.25, # high motor irregularity
        "ddk_regularity_cv": 0.19       # high ddk irregularity (mean 0.11, sd 0.035 -> z ~ +2.28)
    }
    z_map_multi = {
        "finger_tap_interval_cv": 3.25,
        "ddk_regularity_cv": 2.28
    }
    patterns_multi = late_fusion.evaluate_pattern_rules(features_map_multi, z_map_multi, quality_status="valid")
    multi_rule_ids = [p["rule_id"] for p in patterns_multi]
    assert "RULE_COORDINATION_MULTIMODAL" in multi_rule_ids

def test_doctor_review_endpoint(client, db_session, test_doctor):
    # Setup test patient, assessment, and report
    patient = Patient(
        mrn="NC-TEST-P3",
        first_name="Test",
        last_name="Reviewee",
        date_of_birth="1960-01-01",
        gender="female"
    )
    db_session.add(patient)
    db_session.commit()

    assessment = Assessment(
        patient_id=patient.id,
        assessment_type="multimodal",
        clinician_id=test_doctor.id,
        quality_gate_passed=True
    )
    db_session.add(assessment)
    db_session.commit()

    report = Report(
        assessment_id=assessment.id,
        patient_id=patient.id,
        summary_text="Initial draft report",
        overall_status="Watch",
        late_fusion_score=1.4
    )
    db_session.add(report)
    db_session.commit()

    # Submit Doctor Review with 'agree'
    resp = client.post(
        f"/api/v1/reports/{report.id}/review",
        json={
            "feedback": "agree",
            "notes": "Findings correspond with observed subtle bradykinesia in clinical session.",
            "doctor_user_id": test_doctor.id
        }
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["doctor_feedback"] == "agree"
    assert data["approved_by_doctor"] is True
    assert "bradykinesia" in data["doctor_notes"]

    # Submit Doctor Review with 'unsure'
    resp_unsure = client.post(
        f"/api/v1/reports/{report.id}/review",
        json={
            "feedback": "unsure",
            "notes": "Patient reported slight hand fatigue from gardening earlier. Recommend re-testing next week.",
            "doctor_user_id": test_doctor.id
        }
    )
    assert resp_unsure.status_code == 200
    data_unsure = resp_unsure.json()
    assert data_unsure["doctor_feedback"] == "unsure"
    assert data_unsure["approved_by_doctor"] is False
