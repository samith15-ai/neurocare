import pytest
import secrets
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from app.main import app
from app.core.database import SessionLocal, engine, Base
from app.models.user import User
from app.models.patient import Patient
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.baseline import Baseline
from app.models.invitation import Invitation
from app.models.consent import PatientConsent
from app.models.monitoring_plan import MonitoringPlan
from app.models.checkin import DailyCheckin
from app.models.audit_log import AuditLog
from app.services.baseline_service import BaselineEngineService

@pytest.fixture
def client():
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client

def test_invitation_creation_and_validation(client):
    """Verify doctor can generate an invitation with QR/url and validate it."""
    db = SessionLocal()
    doc = db.query(User).filter(User.role == "doctor").first()
    doc_id = doc.id if doc else None
    db.close()

    resp = client.post(
        "/api/v1/enrollment/invitations",
        json={"expires_in_days": 14},
        params={"doctor_id": doc_id} if doc_id else {}
    )
    assert resp.status_code == 201
    data = resp.json()
    assert "INV-" in data["code"]
    assert data["status"] == "pending"
    assert "/enroll?code=" in data["invite_url"]

    # Validate code
    code = data["code"]
    val_resp = client.get(f"/api/v1/enrollment/invitations/{code}")
    assert val_resp.status_code == 200
    assert val_resp.json()["code"] == code

def test_patient_registration_with_granular_consent(client):
    """Verify patient registers via invite code, storing separate consent for features and clips."""
    # 1. Create invitation
    inv_resp = client.post("/api/v1/enrollment/invitations", json={"expires_in_days": 7})
    invite_code = inv_resp.json()["code"]

    # 2. Register patient with granular consent
    unique_email = f"patient_{secrets.token_hex(4)}@test.org"
    reg_payload = {
        "invite_code": invite_code,
        "email": unique_email,
        "password": "Password123!",
        "first_name": "Eleanor",
        "last_name": "Rigby",
        "date_of_birth": "1958-09-14",
        "gender": "Female",
        "consent_version": "v1.0",
        "consent_features": True,
        "consent_evidence_clips": False,
        "consent_research": True,
        "signature_name": "Eleanor Rigby"
    }

    reg_resp = client.post("/api/v1/enrollment/register-with-invite", json=reg_payload)
    assert reg_resp.status_code == 201
    res_data = reg_resp.json()
    assert "access_token" in res_data
    assert res_data["consent"]["features"] is True
    assert res_data["consent"]["evidence_clips"] is False
    patient_id = res_data["patient_id"]

    # Verify invitation marked accepted
    db = SessionLocal()
    inv = db.query(Invitation).filter(Invitation.code == invite_code).first()
    assert inv.status == "accepted"
    assert inv.patient_id == patient_id

    # Verify audit log recorded enrollment
    audit = db.query(AuditLog).filter(
        AuditLog.target_entity == "Patient",
        AuditLog.target_id == patient_id,
        AuditLog.action == "PATIENT_ENROLLMENT"
    ).first()
    assert audit is not None
    db.close()

def test_consent_revocation_and_evidence_purging(client):
    """Verify consent revocation and permanent evidence clip deletion."""
    db = SessionLocal()
    patient = Patient(
        mrn=f"MRN-REV-{secrets.token_hex(3)}",
        first_name="Clara",
        last_name="Oswald",
        date_of_birth="1989-11-23",
        gender="Female"
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    patient_id = patient.id

    # Add initial consent
    consent = PatientConsent(
        patient_id=patient_id,
        consent_version="v1.0",
        consent_features=True,
        consent_evidence_clips=True,
        consent_research=True,
        signature_name="Clara Oswald",
        is_revoked=False
    )
    db.add(consent)

    # Add dummy assessment with raw_payload (evidence clip simulation)
    assessment = Assessment(
        patient_id=patient_id,
        assessment_type="finger_tapping",
        status="completed",
        quality_gate_passed=True
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)

    feat = Feature(
        assessment_id=assessment.id,
        domain="motor",
        feature_name="right_finger_tap_mean_amplitude",
        value=0.55,
        unit="norm",
        raw_payload='{"video_clip_url": "blob:http://localhost/clip123"}'
    )
    db.add(feat)
    db.commit()
    feat_id = feat.id
    db.close()

    # Revoke evidence clips consent
    revoke_resp = client.post(
        "/api/v1/enrollment/consent/revoke",
        json={
            "patient_id": patient_id,
            "scope": "evidence_clips",
            "reason": "Patient requested evidence withdrawal"
        }
    )
    assert revoke_resp.status_code == 200
    assert revoke_resp.json()["is_revoked"] is True
    assert revoke_resp.json()["consent_evidence_clips"] is False

    # Check that raw_payload was purged
    db = SessionLocal()
    updated_feat = db.query(Feature).filter(Feature.id == feat_id).first()
    assert updated_feat.raw_payload is None
    # But numerical feature value is preserved
    assert updated_feat.value == 0.55

    # Check audit log
    audit = db.query(AuditLog).filter(
        AuditLog.action == "REVOKE_CONSENT",
        AuditLog.target_id == patient_id
    ).first()
    assert audit is not None
    db.close()

def test_monitoring_plan_configuration(client):
    """Doctor configures personalized monitoring plan."""
    db = SessionLocal()
    patient = db.query(Patient).first()
    patient_id = patient.id
    db.close()

    plan_payload = {
        "patient_id": patient_id,
        "assessment_types": ["finger_tapping", "speech", "balance"],
        "frequency": "daily",
        "start_date": "2026-10-27",
        "duration_days": 90,
        "reminder_time": "08:30",
        "reminder_enabled": True
    }

    resp = client.post("/api/v1/monitoring-plans", json=plan_payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["frequency"] == "daily"
    assert data["reminder_time"] == "08:30"
    assert "balance" in data["assessment_types"]

    # Fetch active plan
    get_resp = client.get(f"/api/v1/monitoring-plans/patient/{patient_id}")
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == data["id"]

def test_baseline_requires_three_valid_sessions(client):
    """Verify baseline requires at least 3 valid sessions, otherwise returns unestablished message."""
    db = SessionLocal()
    # Create a fresh patient
    new_patient = Patient(
        mrn=f"MRN-TEST-{secrets.token_hex(4)}",
        first_name="Marcus",
        last_name="Brody",
        date_of_birth="1970-01-01",
        gender="Male"
    )
    db.add(new_patient)
    db.commit()
    db.refresh(new_patient)
    pid = new_patient.id

    # 1. Zero sessions
    res0 = BaselineEngineService.calculate_patient_baseline(pid, db)
    assert res0["is_established"] is False
    assert res0["status_message"] == "Personal baseline is not yet established."

    # 2. Add 2 valid sessions
    for i in range(2):
        a = Assessment(patient_id=pid, assessment_type="finger_tapping", status="completed", quality_gate_passed=True)
        db.add(a)
        db.commit()
        db.refresh(a)
        f = Feature(assessment_id=a.id, domain="motor", feature_name="right_finger_tap_frequency_hz", value=3.2 + i*0.1, unit="Hz")
        db.add(f)
        db.commit()

    res2 = BaselineEngineService.calculate_patient_baseline(pid, db)
    assert res2["is_established"] is False
    assert res2["sample_count"] == 2
    assert res2["status_message"] == "Personal baseline is not yet established."

    # 3. Add 3rd valid session
    a3 = Assessment(patient_id=pid, assessment_type="finger_tapping", status="completed", quality_gate_passed=True)
    db.add(a3)
    db.commit()
    db.refresh(a3)
    f3 = Feature(assessment_id=a3.id, domain="motor", feature_name="right_finger_tap_frequency_hz", value=3.3, unit="Hz")
    db.add(f3)
    db.commit()

    res3 = BaselineEngineService.calculate_patient_baseline(pid, db)
    assert res3["is_established"] is True
    assert res3["is_frozen"] is True
    assert res3["sample_count"] == 3
    assert len(res3["baselines"]) == 1
    # Median of [3.2, 3.3, 3.3] is 3.3
    assert abs(res3["baselines"][0]["median"] - 3.3) < 1e-4
    db.close()

def test_baseline_never_absorbs_persistent_deterioration(client):
    """CRITICAL RULE: Cautious baseline engine NEVER absorbs persistent deterioration."""
    db = SessionLocal()
    # Create patient with established baseline
    p = Patient(
        mrn=f"MRN-DET-{secrets.token_hex(4)}",
        first_name="Sarah",
        last_name="Connor",
        date_of_birth="1980-05-10",
        gender="Female"
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    pid = p.id

    # Establish baseline over 3 normal sessions: tap frequency ~ 3.5 Hz
    for val in [3.45, 3.50, 3.55]:
        a = Assessment(patient_id=pid, assessment_type="finger_tapping", status="completed", quality_gate_passed=True)
        db.add(a)
        db.commit()
        db.refresh(a)
        f = Feature(assessment_id=a.id, domain="motor", feature_name="right_finger_tap_frequency_hz", value=val, unit="Hz")
        db.add(f)
        db.commit()

    est = BaselineEngineService.calculate_patient_baseline(pid, db)
    assert est["is_established"] is True
    initial_median = est["baselines"][0]["median"]

    # Now simulate persistent deterioration: tap cadence drops severely to 1.8 Hz (z << -2.0)
    deteriorated_feat = Feature(
        assessment_id="test_det",
        domain="motor",
        feature_name="right_finger_tap_frequency_hz",
        value=1.8,
        unit="Hz"
    )

    update_res = BaselineEngineService.attempt_cautious_update(pid, [deteriorated_feat], db)
    assert update_res["updated"] is False
    assert "Deterioration detected" in update_res["reason"]

    # Check that baseline was NOT altered
    b_after = db.query(Baseline).filter(
        Baseline.patient_id == pid,
        Baseline.feature_name == "right_finger_tap_frequency_hz"
    ).first()
    assert b_after.median_value == initial_median
    assert b_after.mean_value == initial_median

    # Check that REJECT_BASELINE_UPDATE was logged
    audit = db.query(AuditLog).filter(
        AuditLog.action == "REJECT_BASELINE_UPDATE",
        AuditLog.target_id == pid
    ).first()
    assert audit is not None
    db.close()

def test_daily_checkin_context_tags_and_duplicate_prevention(client):
    """Verify daily checkin records context tags and prevents duplicate entries with idempotency key."""
    db = SessionLocal()
    # Create fresh patient for this test
    patient = Patient(
        mrn=f"MRN-CHK-{secrets.token_hex(4)}",
        first_name="Rory",
        last_name="Williams",
        date_of_birth="1989-05-12",
        gender="Male"
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    pid = patient.id
    db.close()

    unique_key = f"IDEM-{secrets.token_hex(6)}"
    checkin_payload = {
        "patient_id": pid,
        "checkin_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "idempotency_key": unique_key,
        "medication_taken": True,
        "medication_notes": "Levodopa 100mg taken at 08:00 AM",
        "sleep_quality": 4,
        "fatigue_level": 2,
        "pain_level": 1,
        "stress_level": 2
    }

    # 1. First submission
    r1 = client.post("/api/v1/checkins", json=checkin_payload)
    assert r1.status_code == 201
    d1 = r1.json()
    assert d1["medication_taken"] is True
    assert d1["sleep_quality"] == 4

    # 2. Duplicate submission with exact same idempotency_key
    r2 = client.post("/api/v1/checkins", json=checkin_payload)
    assert r2.status_code in [200, 201]
    d2 = r2.json()
    # Must return same checkin without creating a duplicate record
    assert d2["id"] == d1["id"]

    # 3. Check today's status & streak
    stat_resp = client.get(f"/api/v1/checkins/today/{pid}")
    assert stat_resp.status_code == 200
    stat_data = stat_resp.json()
    assert stat_data["is_completed_today"] is True
    assert stat_data["current_streak"] >= 1
    assert "🔥" in stat_data["message"]

def test_offline_batch_sync(client):
    """Verify batch sync endpoint processes offline check-in queue idempotently."""
    db = SessionLocal()
    patient = Patient(
        mrn=f"MRN-SYNC-{secrets.token_hex(4)}",
        first_name="Amy",
        last_name="Pond",
        date_of_birth="1989-05-12",
        gender="Female"
    )
    db.add(patient)
    db.commit()
    db.refresh(patient)
    pid = patient.id
    db.close()

    k1 = f"OFFLINE-SYNC-{secrets.token_hex(4)}"
    k2 = f"OFFLINE-SYNC-{secrets.token_hex(4)}"
    batch_payload = {
        "checkins": [
            {
                "patient_id": pid,
                "checkin_date": "2026-10-20",
                "idempotency_key": k1,
                "medication_taken": True,
                "sleep_quality": 3,
                "fatigue_level": 3
            },
            {
                "patient_id": pid,
                "checkin_date": "2026-10-21",
                "idempotency_key": k2,
                "medication_taken": True,
                "sleep_quality": 4,
                "fatigue_level": 2
            }
        ]
    }

    sync_resp = client.post("/api/v1/checkins/sync-batch", json=batch_payload)
    assert sync_resp.status_code == 200
    res = sync_resp.json()
    assert res["synced_count"] == 2

    # Re-syncing same batch must report duplicates_skipped = 2
    resync_resp = client.post("/api/v1/checkins/sync-batch", json=batch_payload)
    assert resync_resp.status_code == 200
    assert resync_resp.json()["duplicates_skipped"] == 2
