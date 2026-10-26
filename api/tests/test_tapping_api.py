import json
import pytest
from app.models.patient import Patient
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.finding import Finding
from app.models.report import Report
from app.services.clinical_rules import clinical_rules

def test_store_finger_tapping_features_via_api(client, db_session):
    # 1. Setup patient
    p = db_session.query(Patient).filter(Patient.mrn == "NC-2026-0841").first()
    if not p:
        p = Patient(
            mrn="NC-2026-0841",
            first_name="Arthur",
            last_name="Pendelton",
            date_of_birth="1962-04-12",
            gender="Male"
        )
        db_session.add(p)
        db_session.commit()

    # 2. Start motor assessment
    ass_res = client.post(
        "/api/v1/assessments",
        json={
            "patient_id": p.id,
            "assessment_type": "motor",
            "quality_gate_passed": True,
            "quality_notes": "Lighting and framing valid for both hands.",
            "is_simulated": True
        }
    )
    assert ass_res.status_code == 201
    ass_data = ass_res.json()
    ass_id = ass_data["id"]

    # 3. Store batch of tapping features
    features_payload = [
        {
            "assessment_id": ass_id,
            "domain": "motor",
            "feature_name": "right_finger_tap_frequency_hz",
            "value": 3.1,
            "unit": "Hz",
            "confidence": 0.95,
            "is_simulated": True,
            "raw_payload": json.dumps({"tap_count": 14})
        },
        {
            "assessment_id": ass_id,
            "domain": "motor",
            "feature_name": "right_finger_tap_mean_amplitude",
            "value": 1.15,
            "unit": "ratio",
            "confidence": 0.92,
            "is_simulated": True
        },
        {
            "assessment_id": ass_id,
            "domain": "motor",
            "feature_name": "right_finger_tap_amplitude_decay_slope",
            "value": -0.18,
            "unit": "slope",
            "confidence": 0.90,
            "is_simulated": True
        },
        {
            "assessment_id": ass_id,
            "domain": "motor",
            "feature_name": "left_finger_tap_frequency_hz",
            "value": 2.9,
            "unit": "Hz",
            "confidence": 0.94,
            "is_simulated": True
        },
        {
            "assessment_id": ass_id,
            "domain": "motor",
            "feature_name": "bilateral_tap_frequency_asymmetry",
            "value": 0.065,
            "unit": "ratio",
            "confidence": 0.93,
            "is_simulated": True
        }
    ]

    feat_res = client.post("/api/v1/features/batch", json=features_payload)
    assert feat_res.status_code == 201
    saved_feats = feat_res.json()
    assert len(saved_feats) == 5

    # 4. Generate report
    rep_res = client.post(f"/api/v1/reports/generate/{ass_id}")
    assert rep_res.status_code == 200
    rep_data = rep_res.json()
    assert rep_data["assessment_id"] == ass_id
    assert "Contactless multimodal evaluation completed" in rep_data["summary_text"]

def test_poor_quality_recording_does_not_generate_abnormal_finding(client, db_session):
    # Rule: Quality is not pathology!
    # A recording with failed quality gate must NOT produce a pathology finding
    p = db_session.query(Patient).first()
    
    ass_res = client.post(
        "/api/v1/assessments",
        json={
            "patient_id": p.id,
            "assessment_type": "motor",
            "quality_gate_passed": False,
            "quality_notes": "INSUFFICIENT_RECORDING_QUALITY: Hand was occluded outside framing target.",
            "is_simulated": True
        }
    )
    assert ass_res.status_code == 201
    ass_id = ass_res.json()["id"]

    # Even if feature values are abnormal due to bad tracking, report must explicitly state flagged quality
    rep_res = client.post(f"/api/v1/reports/generate/{ass_id}")
    assert rep_res.status_code == 200
    rep = rep_res.json()
    assert "Quality gate status: Flagged" in rep["summary_text"]
