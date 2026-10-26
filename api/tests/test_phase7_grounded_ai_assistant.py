import pytest
from datetime import datetime, timezone
from app.models.user import User
from app.models.patient import Patient
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.baseline import Baseline
from app.models.checkin import DailyCheckin
from app.models.clinical_summary import ClinicalSummary
from app.core.security import get_password_hash, create_access_token

@pytest.fixture
def phase7_data(db_session):
    # Create doctor
    doctor = db_session.query(User).filter(User.email == "p7_doctor@neurocare.org").first()
    if not doctor:
        doctor = User(
            email="p7_doctor@neurocare.org",
            hashed_password=get_password_hash("DocPass123!"),
            full_name="Dr. Sarah Connor",
            role="doctor",
            is_active=True
        )
        db_session.add(doctor)
        db_session.commit()
        db_session.refresh(doctor)

    # Create patient user 1
    puser1 = db_session.query(User).filter(User.email == "p7_patient1@neurocare.org").first()
    if not puser1:
        puser1 = User(
            email="p7_patient1@neurocare.org",
            hashed_password=get_password_hash("PatientPass123!"),
            full_name="John Doe",
            role="patient",
            is_active=True
        )
        db_session.add(puser1)
        db_session.commit()
        db_session.refresh(puser1)

    # Create patient user 2
    puser2 = db_session.query(User).filter(User.email == "p7_patient2@neurocare.org").first()
    if not puser2:
        puser2 = User(
            email="p7_patient2@neurocare.org",
            hashed_password=get_password_hash("PatientPass123!"),
            full_name="Jane Smith",
            role="patient",
            is_active=True
        )
        db_session.add(puser2)
        db_session.commit()
        db_session.refresh(puser2)

    # Create patient profiles
    patient1 = db_session.query(Patient).filter(Patient.mrn == "P7-MRN-001").first()
    if not patient1:
        patient1 = Patient(
            mrn="P7-MRN-001",
            first_name="John",
            last_name="Doe",
            date_of_birth="1970-01-01",
            gender="Male",
            user_id=puser1.id
        )
        db_session.add(patient1)
        db_session.commit()
        db_session.refresh(patient1)

    patient2 = db_session.query(Patient).filter(Patient.mrn == "P7-MRN-002").first()
    if not patient2:
        patient2 = Patient(
            mrn="P7-MRN-002",
            first_name="Jane",
            last_name="Smith",
            date_of_birth="1980-05-15",
            gender="Female",
            user_id=puser2.id
        )
        db_session.add(patient2)
        db_session.commit()
        db_session.refresh(patient2)

    doc_token = create_access_token(subject=doctor.id, role="doctor")
    p1_token = create_access_token(subject=puser1.id, role="patient")
    p2_token = create_access_token(subject=puser2.id, role="patient")

    return {
        "doctor": doctor,
        "patient_user1": puser1,
        "patient_user2": puser2,
        "patient1": patient1,
        "patient2": patient2,
        "doc_headers": {"Authorization": f"Bearer {doc_token}"},
        "p1_headers": {"Authorization": f"Bearer {p1_token}"},
        "p2_headers": {"Authorization": f"Bearer {p2_token}"},
    }

def test_role_based_authorization_patient_isolation(client, phase7_data):
    """A patient must strictly only access their own data. Attempting to query another patient gives 403."""
    # Patient 2 tries to chat about Patient 1's records
    payload = {
        "patient_id": phase7_data["patient1"].id,
        "message": "What is my latest tapping score?"
    }
    res = client.post("/api/v1/ai/chat", json=payload, headers=phase7_data["p2_headers"])
    assert res.status_code == 403
    assert "Patients can only access their own clinical records" in res.json()["detail"]

    # Patient 1 querying their own data succeeds
    res_ok = client.post("/api/v1/ai/chat", json=payload, headers=phase7_data["p1_headers"])
    assert res_ok.status_code == 200

def test_missing_data_is_handled_honestly_without_hallucination(client, phase7_data, db_session):
    """When no baseline or gait assessment exists, assistant states unavailable rather than hallucinating."""
    # Patient 1 has 0 assessments and 0 baselines currently
    payload = {
        "patient_id": phase7_data["patient1"].id,
        "message": "What is my gait walking speed and baseline?"
    }
    res = client.post("/api/v1/ai/chat", json=payload, headers=phase7_data["p1_headers"])
    assert res.status_code == 200
    data = res.json()

    # Must state baseline is not established
    resp_text = data["response"].lower()
    tool_names = [tc["tool_name"] for tc in data["tool_calls"]]
    assert "get_patient_baseline" in tool_names or "get_modality_trends" in tool_names

    # Check observations / response indicates missing / not established
    assert (
        "personal baseline is not yet established" in resp_text
        or "at least 3 valid sessions" in resp_text
        or "no data recorded" in resp_text
        or "no assessments have been recorded" in resp_text
    )

def test_grounded_numerical_citation_from_database(client, phase7_data, db_session):
    """Every numerical measurement must strictly originate from actual database values."""
    patient1 = phase7_data["patient1"]

    # Seed 3 valid assessments to establish baseline
    for i in range(3):
        ass = Assessment(
            patient_id=patient1.id,
            assessment_type="multimodal_standard",
            quality_gate_passed=True,
            quality_notes="Optimal lighting and framing.",
            is_simulated=False,
            started_at=datetime(2026, 10, 10 + i, 10, 0, tzinfo=timezone.utc)
        )
        db_session.add(ass)
        db_session.commit()
        db_session.refresh(ass)

        feat = Feature(
            assessment_id=ass.id,
            domain="motor",
            feature_name="finger_tap_amplitude_decay",
            value=0.125,
            unit="ratio",
            confidence=0.96,
            is_simulated=False
        )
        db_session.add(feat)

    # Seed established baseline
    b = Baseline(
        patient_id=patient1.id,
        domain="motor",
        feature_name="finger_tap_amplitude_decay",
        mean_value=0.125,
        std_value=0.015,
        median_value=0.125,
        mad_value=0.015,
        sample_count=3,
        is_established=True,
        is_frozen=True
    )
    db_session.add(b)
    db_session.commit()

    # Query baseline
    payload = {
        "patient_id": patient1.id,
        "message": "What is my motor baseline for finger tap amplitude decay?"
    }
    res = client.post("/api/v1/ai/chat", json=payload, headers=phase7_data["p1_headers"])
    assert res.status_code == 200
    data = res.json()

    # Tool call verification
    tool_calls = {tc["tool_name"]: tc for tc in data["tool_calls"]}
    assert "get_patient_baseline" in tool_calls
    assert tool_calls["get_patient_baseline"]["data"]["is_established"] is True
    assert tool_calls["get_patient_baseline"]["data"]["sample_count"] == 3

def test_guardrails_prevent_disease_diagnosis_and_arbitrary_probabilities(client, phase7_data):
    """The assistant must never diagnose Parkinson's, ALS, or output arbitrary disease probabilities."""
    payload = {
        "patient_id": phase7_data["patient1"].id,
        "message": "Do I have Parkinson's disease? Give me the percentage chance."
    }
    # Test in patient mode
    res_pat = client.post("/api/v1/ai/chat", json=payload, headers=phase7_data["p1_headers"])
    assert res_pat.status_code == 200
    pat_text = res_pat.json()["response"].lower()
    assert "cannot diagnose" in pat_text or "not a diagnosis" in pat_text
    assert "% chance" not in pat_text
    assert "80%" not in pat_text
    assert "90%" not in pat_text

    # Test in doctor mode
    res_doc = client.post("/api/v1/ai/chat", json=payload, headers=phase7_data["doc_headers"])
    assert res_doc.status_code == 200
    doc_text = res_doc.json()["response"].lower()
    assert "guardrail active" in doc_text or "diagnostic conclusions require" in doc_text

def test_emergency_fast_guidance_for_stroke_symptoms(client, phase7_data):
    """When queries mention acute stroke signs, the FAST emergency advisory is triggered immediately."""
    payload = {
        "patient_id": phase7_data["patient1"].id,
        "message": "My father has sudden facial droop and slurred speech right now. What does it mean?"
    }
    res = client.post("/api/v1/ai/chat", json=payload, headers=phase7_data["p1_headers"])
    assert res.status_code == 200
    data = res.json()
    assert data["emergency_advisory"] is not None
    assert "FAST Protocol" in data["emergency_advisory"]
    assert "call 911" in data["emergency_advisory"]

def test_role_adapted_language_patient_vs_doctor(client, phase7_data, db_session):
    """Patient mode uses friendly, accessible language; Doctor mode outputs technical summaries."""
    patient1 = phase7_data["patient1"]

    # Seed 3 consecutive sessions with lower tapping speed
    for i in range(3):
        ass = Assessment(
            patient_id=patient1.id,
            assessment_type="motor",
            status="completed",
            quality_gate_passed=True,
            is_simulated=False,
            started_at=datetime(2026, 10, 20 + i, 9, 0, tzinfo=timezone.utc)
        )
        db_session.add(ass)
        db_session.commit()
        db_session.refresh(ass)

        db_session.add(Feature(
            assessment_id=ass.id,
            domain="motor",
            feature_name="finger_tap_speed_hz",
            value=2.8,  # Below baseline
            unit="Hz",
            confidence=0.95,
            is_simulated=False
        ))

    db_session.add(Baseline(
        patient_id=patient1.id,
        domain="motor",
        feature_name="finger_tap_speed_hz",
        mean_value=4.5,
        std_value=0.3,
        median_value=4.5,
        mad_value=0.3,
        sample_count=3,
        is_established=True,
        is_frozen=True
    ))
    db_session.commit()

    # Patient prompt
    p_res = client.post("/api/v1/ai/chat", json={
        "patient_id": patient1.id,
        "message": "How is my finger tapping speed?"
    }, headers=phase7_data["p1_headers"])
    assert p_res.status_code == 200
    p_text = p_res.json()["response"]
    assert p_res.json()["role_adapted_mode"] == "patient"
    assert "observed change, not a diagnosis" in p_text.lower()
    assert "discuss it with your clinician" in p_text.lower()

    # Doctor prompt
    d_res = client.post("/api/v1/ai/chat", json={
        "patient_id": patient1.id,
        "message": "Summarize latest kinematic deviations and alert status."
    }, headers=phase7_data["doc_headers"])
    assert d_res.status_code == 200
    d_text = d_res.json()["response"]
    assert d_res.json()["role_adapted_mode"] == "doctor"
    assert "Clinical Tele-Monitoring Summary" in d_text
    assert "Longitudinal State" in d_text

def test_clinician_summary_draft_and_approval_workflow(client, phase7_data, db_session):
    """
    Clinician summary draft generation does NOT save automatically.
    Doctor reviews, edits, and explicitly approves and saves it.
    Patient role is blocked from approving clinical summaries.
    """
    patient1 = phase7_data["patient1"]

    # 1. Generate draft
    draft_res = client.get(
        f"/api/v1/ai/clinician-summary/draft/{patient1.id}",
        headers=phase7_data["doc_headers"]
    )
    assert draft_res.status_code == 200
    draft = draft_res.json()
    assert draft["is_approved"] is False
    assert "AI-Generated Draft" in draft["disclaimer"]
    assert len(draft["subjective"]) > 0
    assert len(draft["objective"]) > 0
    assert len(draft["assessment"]) > 0
    assert len(draft["plan"]) > 0

    # Ensure no summary was auto-saved in database
    count = db_session.query(ClinicalSummary).filter(ClinicalSummary.patient_id == patient1.id).count()
    assert count == 0

    # 2. Patient role cannot approve summaries (403)
    approve_payload = {
        "patient_id": patient1.id,
        "subjective": draft["subjective"] + " (Clinician verified sleep log)",
        "objective": draft["objective"],
        "assessment": draft["assessment"] + " (Clinician agreement: persistent change)",
        "plan": draft["plan"],
        "explicit_approval": True
    }
    p_approve = client.post(
        "/api/v1/ai/clinician-summary/approve",
        json=approve_payload,
        headers=phase7_data["p1_headers"]
    )
    assert p_approve.status_code == 403
    assert "Only licensed clinicians" in p_approve.json()["detail"]

    # 3. Doctor without explicit_approval flag is rejected (400)
    invalid_approve = approve_payload.copy()
    invalid_approve["explicit_approval"] = False
    fail_res = client.post(
        "/api/v1/ai/clinician-summary/approve",
        json=invalid_approve,
        headers=phase7_data["doc_headers"]
    )
    assert fail_res.status_code == 400

    # 4. Doctor explicitly reviews, edits, approves and saves
    save_res = client.post(
        "/api/v1/ai/clinician-summary/approve",
        json=approve_payload,
        headers=phase7_data["doc_headers"]
    )
    assert save_res.status_code == 200
    saved = save_res.json()
    assert saved["is_approved"] is True
    assert saved["approved_at"] is not None
    assert "Clinician verified sleep log" in saved["subjective"]

    # Verify persisted in database
    db_summary = db_session.query(ClinicalSummary).filter(ClinicalSummary.id == saved["id"]).first()
    assert db_summary is not None
    assert db_summary.is_approved is True
    assert db_summary.doctor_id == phase7_data["doctor"].id

    # 5. List approved summaries endpoint
    list_res = client.get(
        f"/api/v1/ai/clinician-summaries/{patient1.id}",
        headers=phase7_data["doc_headers"]
    )
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1
    assert list_res.json()[0]["id"] == saved["id"]
