import pytest
import secrets
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from app.main import app, auto_migrate_sqlite
from app.core.database import SessionLocal, engine, Base
from app.models.user import User
from app.models.patient import Patient
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.baseline import Baseline
from app.models.report import Report
from app.models.treatment_event import TreatmentEvent
from app.services.longitudinal_intelligence import LongitudinalIntelligenceService

@pytest.fixture
def client():
    Base.metadata.create_all(bind=engine)
    auto_migrate_sqlite()
    with TestClient(app) as test_client:
        yield test_client

def test_change_detection_classification_and_single_session_rule():
    """Verify change detection classifications and rule: single abnormal session produces 'Observed once'."""
    # 1. Stable series
    stable_res = LongitudinalIntelligenceService.classify_feature_trajectory(
        "right_finger_tap_frequency_hz",
        "motor",
        [0.1, -0.2, 0.3, 0.0],
        ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]
    )
    assert stable_res["classification"] == "stable"
    assert abs(stable_res["current_z"]) < 1.0

    # 2. Single sudden deviation: MUST produce 'Observed once — repeat assessment recommended.'
    sudden_res = LongitudinalIntelligenceService.classify_feature_trajectory(
        "right_finger_tap_frequency_hz",
        "motor",
        [0.0, 0.1, -2.5],
        ["2026-10-01", "2026-10-02", "2026-10-03"]
    )
    assert sudden_res["classification"] == "sudden_deviation"
    assert sudden_res["consecutive_beyond_threshold"] == 1
    assert "Observed once — repeat assessment recommended." in sudden_res["guidance"]

    # 3. Persistent change: requires >= 3 consecutive valid sessions beyond threshold
    two_sessions = LongitudinalIntelligenceService.classify_feature_trajectory(
        "right_finger_tap_frequency_hz",
        "motor",
        [0.0, -1.8, -2.1],
        ["2026-10-01", "2026-10-02", "2026-10-03"]
    )
    assert two_sessions["classification"] == "sudden_deviation"
    assert two_sessions["consecutive_beyond_threshold"] == 2

    three_sessions = LongitudinalIntelligenceService.classify_feature_trajectory(
        "right_finger_tap_frequency_hz",
        "motor",
        [0.0, -1.8, -2.1, -2.4],
        ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]
    )
    assert three_sessions["classification"] == "persistent_change"
    assert three_sessions["consecutive_beyond_threshold"] >= 3

def test_missing_sessions_do_not_raise_change_scores():
    """Verify that gaps or missing sessions are never interpreted as worsening ('Missing is not abnormal')."""
    # 5 calendar days with only 2 sessions on day 1 and day 5 (days 2, 3, 4 missing)
    dates = ["2026-10-01", "2026-10-05"]
    z_series = [0.2, 0.1]
    res = LongitudinalIntelligenceService.classify_feature_trajectory(
        "right_finger_tap_frequency_hz",
        "motor",
        z_series,
        dates
    )
    assert res["classification"] == "stable"
    assert res["consecutive_beyond_threshold"] == 0

def test_synthetic_cusum_onset_detection():
    """Verify two-sided CUSUM detects synthetic step onset and outputs clinical disclaimer."""
    dates = [f"2026-10-{i:02d}" for i in range(1, 15)]
    # 7 stable sessions followed by sudden shift of -2.5 sigma starting at day 8
    z_series = [0.1, -0.2, 0.0, 0.2, -0.1, 0.1, -0.1, -2.2, -2.5, -2.6, -2.7, -2.8, -2.5, -2.6]

    cp_res = LongitudinalIntelligenceService.detect_change_point_cusum(z_series, dates)
    assert cp_res["has_change_point"] is True
    assert cp_res["confidence_score"] >= 0.70
    assert "Estimated empirical monitoring change point" in cp_res["disclaimer"]
    assert "not the onset of a disease" in cp_res["disclaimer"]

def test_synthetic_recovery_tracking_and_plateau():
    """Verify experimental recovery index tracks progress toward baseline and detects plateaus."""
    dates = [f"2026-10-{i:02d}" for i in range(1, 10)]
    # Severe drop to 3.0 sigma, then recovering back: 3.0 -> 2.0 -> 1.0 -> 0.3
    recovering_z = [0.0, 3.0, 2.5, 2.0, 1.5, 1.0, 0.5, 0.3, 0.1]
    rec_res = LongitudinalIntelligenceService.compute_recovery_index(recovering_z, dates)

    assert rec_res["peak_deviation_z"] == 3.0
    # At 0.1 z relative to peak 3.0 z, recovery is ~96.7%
    assert rec_res["overall_recovery_index"] >= 90.0
    assert "Experimental Index" in rec_res["experimental_disclaimer"]

    # Plateau test: deviation drops to 2.2, then stalls across 4 sessions
    stalled_z = [0.0, 3.0, 2.3, 2.2, 2.25, 2.2, 2.22]
    stalled_dates = [f"2026-10-{i:02d}" for i in range(1, len(stalled_z) + 1)]
    plat_res = LongitudinalIntelligenceService.compute_recovery_index(stalled_z, stalled_dates)
    assert plat_res["plateau_detected"] is True
    assert plat_res["plateau_note"] is not None
    assert "plateaued" in plat_res["plateau_note"]

def test_false_alarm_rate_under_stable_null_hypothesis():
    """Evaluate that synthetic nominal noise produces zero false-positive persistent change alarms."""
    import random
    random.seed(42)
    # 30 simulated stable sessions with small Gaussian physiological noise ~ N(0, 0.35^2)
    stable_noise = [random.gauss(0, 0.35) for _ in range(30)]
    dates = [f"2026-10-{i:02d}" for i in range(1, 31)]

    res = LongitudinalIntelligenceService.classify_feature_trajectory(
        "right_finger_tap_frequency_hz",
        "motor",
        stable_noise,
        dates
    )
    # Must NEVER trigger persistent change under pure baseline variance
    assert res["classification"] != "persistent_change"
    assert res["consecutive_beyond_threshold"] == 0

def test_timeline_state_smoothing_noise_rejection(client):
    """Verify single noisy assessment does not transition patient state to active_change."""
    db = SessionLocal()
    # Create patient with baseline
    p = Patient(
        mrn=f"MRN-TIME-{secrets.token_hex(4)}",
        first_name="Donna",
        last_name="Noble",
        date_of_birth="1975-04-18",
        gender="Female"
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    pid = p.id

    # Add baseline
    b = Baseline(
        patient_id=pid,
        domain="motor",
        feature_name="right_finger_tap_frequency_hz",
        mean_value=3.5,
        std_value=0.3,
        sample_count=5,
        is_established=True,
        is_frozen=True
    )
    db.add(b)
    db.commit()

    # Session 1: Normal
    a1 = Assessment(patient_id=pid, assessment_type="finger_tapping", status="completed", quality_gate_passed=True, started_at=datetime(2026, 10, 1))
    db.add(a1)
    db.commit()
    f1 = Feature(assessment_id=a1.id, domain="motor", feature_name="right_finger_tap_frequency_hz", value=3.4, unit="Hz")
    db.add(f1)
    db.commit()

    # Session 2: A single noisy outlier session (e.g. patient sneezed / momentary fumble, 1.8 Hz)
    a2 = Assessment(patient_id=pid, assessment_type="finger_tapping", status="completed", quality_gate_passed=True, started_at=datetime(2026, 10, 2))
    db.add(a2)
    db.commit()
    f2 = Feature(assessment_id=a2.id, domain="motor", feature_name="right_finger_tap_frequency_hz", value=1.8, unit="Hz")
    db.add(f2)
    db.commit()

    # Evaluate: Single noisy session must NOT cause 'active_change'
    eval_res = LongitudinalIntelligenceService.evaluate_patient_longitudinal_intelligence(pid, db)
    assert eval_res["timeline_state"] != "active_change"
    assert eval_res["timeline_state"] in ["baseline", "onset"]
    # Alert is at most watch, not review_advised for single noise
    assert eval_res["overall_alert"] in ["watch", "stable"]
    db.close()

def test_treatment_event_logging_and_correlation_api(client):
    """Verify treatment event creation, listing, and non-causal correlation phrasing."""
    db = SessionLocal()
    patient = db.query(Patient).first()
    pid = patient.id
    db.close()

    # 1. Log a treatment event
    event_payload = {
        "patient_id": pid,
        "event_type": "medication_change",
        "event_date": "2026-10-15",
        "title": "Levodopa Dose Adjustment",
        "description": "Increased dose from 100mg to 150mg TDS"
    }

    resp = client.post("/api/v1/longitudinal/treatment-events", json=event_payload)
    assert resp.status_code == 201
    evt_data = resp.json()
    assert evt_data["title"] == "Levodopa Dose Adjustment"
    event_id = evt_data["id"]

    # 2. Retrieve treatment events
    get_resp = client.get(f"/api/v1/longitudinal/treatment-events/{pid}")
    assert get_resp.status_code == 200
    events = get_resp.json()
    assert any(e["id"] == event_id for e in events)

    # 3. Comprehensive analysis endpoint
    analysis_resp = client.get(f"/api/v1/longitudinal/analysis/{pid}")
    assert analysis_resp.status_code == 200
    report = analysis_resp.json()
    assert "timeline_state" in report
    assert "recovery" in report
    assert "overall_recovery_index" in report["recovery"]
    assert "treatment_events" in report

    # 4. Cleanup
    del_resp = client.delete(f"/api/v1/longitudinal/treatment-events/{event_id}")
    assert del_resp.status_code == 200

def test_emergency_fast_rule_priority_over_longitudinal_status(client):
    """Verify stroke emergency FAST rule takes absolute priority in overall alert level."""
    db = SessionLocal()
    patient = db.query(Patient).first()
    pid = patient.id

    # Create assessment with emergency_fast_triggered = True
    ass = Assessment(patient_id=pid, assessment_type="multimodal_standard", status="completed", quality_gate_passed=True)
    db.add(ass)
    db.commit()

    rep = Report(
        assessment_id=ass.id,
        patient_id=pid,
        summary_text="FAST positive",
        emergency_fast_triggered=True,
        emergency_details="Unilateral facial droop and arm weakness detected",
        approved_by_doctor=False
    )
    db.add(rep)
    db.commit()

    # Even if other longitudinal features appear stable, FAST alert must force review_advised
    eval_res = LongitudinalIntelligenceService.evaluate_patient_longitudinal_intelligence(pid, db)
    assert eval_res["emergency_fast_triggered"] is True
    assert eval_res["overall_alert"] == "review_advised"
    assert "EMERGENCY" in eval_res["alert_explanation"]
    db.close()
