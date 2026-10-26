import pytest
import json
from app.services.late_fusion import late_fusion
from app.models.patient import Patient
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.report import Report

def test_gait_scoring_and_pattern_detection(client, db_session, test_doctor):
    patient = Patient(
        mrn="NC-GAIT-001",
        first_name="Eleanor",
        last_name="Rigby",
        date_of_birth="1958-06-18",
        gender="female"
    )
    db_session.add(patient)
    db_session.commit()

    ass = Assessment(
        patient_id=patient.id,
        assessment_type="gait",
        clinician_id=test_doctor.id,
        quality_gate_passed=True
    )
    db_session.add(ass)
    db_session.commit()

    # Asymmetric gait features (step symmetry low, arm swing asymmetry high)
    # Ref: gait_step_symmetry_ratio mean 0.94, sd 0.05 -> 0.82 has z = (0.82 - 0.94)/0.05 = -2.40 (<= -1.6)
    # Ref: gait_arm_swing_asymmetry mean 0.08, sd 0.05 -> 0.20 has z = (0.20 - 0.08)/0.05 = +2.40 (>= 1.8)
    features_payload = [
        {
            "assessment_id": ass.id,
            "domain": "gait",
            "feature_name": "gait_cadence_steps_per_min",
            "value": 92.0,
            "unit": "steps/min",
            "confidence": 0.94,
            "is_simulated": True
        },
        {
            "assessment_id": ass.id,
            "domain": "gait",
            "feature_name": "gait_step_symmetry_ratio",
            "value": 0.82,
            "unit": "ratio",
            "confidence": 0.93,
            "is_simulated": True
        },
        {
            "assessment_id": ass.id,
            "domain": "gait",
            "feature_name": "gait_arm_swing_asymmetry",
            "value": 0.20,
            "unit": "ratio",
            "confidence": 0.91,
            "is_simulated": True
        }
    ]

    res_batch = client.post("/api/v1/features/batch", json=features_payload)
    assert res_batch.status_code == 201

    # Generate report
    rep_res = client.post(f"/api/v1/reports/generate/{ass.id}")
    assert rep_res.status_code == 200
    rep_data = rep_res.json()

    # Check domain scores
    domain_scores = json.loads(rep_data["domain_scores_json"])
    assert domain_scores["gait"] is not None
    assert domain_scores["gait"] > 1.5

    # Check findings for gait asymmetry pattern
    findings = rep_data.get("findings", [])
    rule_ids = []
    for f in findings:
        try:
            ev = json.loads(f["evidence_metrics"])
            rule_ids.append(ev.get("rule_id"))
        except:
            pass
    assert "RULE_GAIT_ASYMMETRY_REDUCED_ARM_SWING" in rule_ids

def test_balance_safety_skip_does_not_invent_pathology(client, db_session, test_doctor):
    patient = Patient(
        mrn="NC-BAL-SKIP",
        first_name="Robert",
        last_name="Paulson",
        date_of_birth="1949-11-20",
        gender="male"
    )
    db_session.add(patient)
    db_session.commit()

    # Skipped assessment: quality gate passed (valid skip event), but 0 features recorded
    ass = Assessment(
        patient_id=patient.id,
        assessment_type="balance",
        clinician_id=test_doctor.id,
        quality_gate_passed=True,
        quality_notes="NOT_ASSESSED_SAFETY: Patient opted out of stance test during safety screen."
    )
    db_session.add(ass)
    db_session.commit()

    # Generate report with no balance features
    rep_res = client.post(f"/api/v1/reports/generate/{ass.id}")
    assert rep_res.status_code == 200
    rep_data = rep_res.json()

    # Medical rule check: Missing balance MUST NOT produce abnormal score or false pathology
    domain_scores = json.loads(rep_data["domain_scores_json"])
    assert domain_scores["balance"] is None
    assert rep_data["overall_status"] == "No flag"
    assert len(rep_data.get("findings", [])) == 0

def test_cognitive_scoring_and_psychomotor_slowness(client, db_session, test_doctor):
    patient = Patient(
        mrn="NC-COG-001",
        first_name="Clara",
        last_name="Oswald",
        date_of_birth="1975-03-23",
        gender="female"
    )
    db_session.add(patient)
    db_session.commit()

    ass = Assessment(
        patient_id=patient.id,
        assessment_type="cognition",
        clinician_id=test_doctor.id,
        quality_gate_passed=True
    )
    db_session.add(ass)
    db_session.commit()

    # Prolonged reaction time: 375ms (mean 275, sd 45 -> z = +2.22 >= 1.8)
    # Reduced sequence span: 3.5 items (mean 5.5, sd 1.1 -> z = -1.82 <= -1.5)
    features_payload = [
        {
            "assessment_id": ass.id,
            "domain": "cognition",
            "feature_name": "cognitive_simple_reaction_time_ms",
            "value": 375.0,
            "unit": "ms",
            "confidence": 0.95,
            "is_simulated": True
        },
        {
            "assessment_id": ass.id,
            "domain": "cognition",
            "feature_name": "cognitive_sequence_span_length",
            "value": 3.5,
            "unit": "items",
            "confidence": 0.93,
            "is_simulated": True
        },
        {
            "assessment_id": ass.id,
            "domain": "cognition",
            "feature_name": "cognitive_gonogo_accuracy_percent",
            "value": 88.0,
            "unit": "%",
            "confidence": 0.96,
            "is_simulated": True
        }
    ]

    res_batch = client.post("/api/v1/features/batch", json=features_payload)
    assert res_batch.status_code == 201

    rep_res = client.post(f"/api/v1/reports/generate/{ass.id}")
    assert rep_res.status_code == 200
    rep_data = rep_res.json()

    domain_scores = json.loads(rep_data["domain_scores_json"])
    assert domain_scores["cognition"] is not None
    assert domain_scores["cognition"] >= 1.5

    findings = rep_data.get("findings", [])
    rule_ids = []
    for f in findings:
        try:
            ev = json.loads(f["evidence_metrics"])
            rule_ids.append(ev.get("rule_id"))
        except:
            pass
    assert "RULE_COGNITIVE_PSYCHOMOTOR_SLOWNESS" in rule_ids

def test_test_retest_change_calculation():
    current_features = [
        {"feature_name": "gait_cadence_steps_per_min", "value": 95.0},
        {"feature_name": "cognitive_simple_reaction_time_ms", "value": 330.0}
    ]
    baseline_features = {
        "gait_cadence_steps_per_min": 108.0,
        "cognitive_simple_reaction_time_ms": 280.0
    }

    retest = late_fusion.compute_test_retest_change(current_features, baseline_features)
    assert len(retest) == 2

    cadence_retest = next(r for r in retest if r["feature_name"] == "gait_cadence_steps_per_min")
    assert cadence_retest["delta"] == -13.0
    assert cadence_retest["trend_direction"] == "declining"
    assert cadence_retest["percent_change"] == -12.0

    rt_retest = next(r for r in retest if r["feature_name"] == "cognitive_simple_reaction_time_ms")
    assert rt_retest["delta"] == 50.0
    assert rt_retest["trend_direction"] == "elevated"
