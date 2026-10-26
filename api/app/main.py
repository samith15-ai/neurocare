from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import Base, engine, SessionLocal
from app.routers import (
    health_router,
    auth_router,
    patients_router,
    assessments_router,
    features_router,
    baselines_router,
    findings_router,
    reports_router,
    monitoring_router,
    ai_router,
    audit_router,
    enrollment_router,
    monitoring_plans_router,
    checkins_router
)
from app.models.user import User
from app.models.patient import Patient
from app.models.assessment import Assessment
from app.models.feature import Feature
from app.models.baseline import Baseline
from app.models.finding import Finding
from app.models.report import Report
from app.models.consent import PatientConsent
from app.models.monitoring_plan import MonitoringPlan
from app.core.security import get_password_hash

from sqlalchemy import text

# Create tables
Base.metadata.create_all(bind=engine)

def auto_migrate_sqlite():
    """Ensure newly added columns exist in SQLite database tables without wiping existing data."""
    try:
        with engine.connect() as conn:
            # Check baselines table
            res = conn.execute(text("PRAGMA table_info(baselines)")).fetchall()
            col_names = {row[1] for row in res}
            if "median_value" not in col_names:
                conn.execute(text("ALTER TABLE baselines ADD COLUMN median_value FLOAT"))
            if "mad_value" not in col_names:
                conn.execute(text("ALTER TABLE baselines ADD COLUMN mad_value FLOAT"))
            if "min_mad_floor" not in col_names:
                conn.execute(text("ALTER TABLE baselines ADD COLUMN min_mad_floor FLOAT DEFAULT 0.01"))
            if "is_established" not in col_names:
                conn.execute(text("ALTER TABLE baselines ADD COLUMN is_established BOOLEAN DEFAULT 0"))
            if "is_frozen" not in col_names:
                conn.execute(text("ALTER TABLE baselines ADD COLUMN is_frozen BOOLEAN DEFAULT 0"))
            if "status_message" not in col_names:
                conn.execute(text("ALTER TABLE baselines ADD COLUMN status_message VARCHAR(100) DEFAULT 'Personal baseline is not yet established.'"))
            conn.commit()
    except Exception as e:
        print(f"Warning during auto_migrate_sqlite: {e}")

auto_migrate_sqlite()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Contactless Multimodal System for Personalized Neurological Monitoring (Medaithon MED-PS-002)"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers under API_PREFIX
app.include_router(health_router, prefix=settings.API_PREFIX)
app.include_router(auth_router, prefix=settings.API_PREFIX)
app.include_router(patients_router, prefix=settings.API_PREFIX)
app.include_router(assessments_router, prefix=settings.API_PREFIX)
app.include_router(features_router, prefix=settings.API_PREFIX)
app.include_router(baselines_router, prefix=settings.API_PREFIX)
app.include_router(findings_router, prefix=settings.API_PREFIX)
app.include_router(reports_router, prefix=settings.API_PREFIX)
app.include_router(monitoring_router, prefix=settings.API_PREFIX)
app.include_router(ai_router, prefix=settings.API_PREFIX)
app.include_router(audit_router, prefix=settings.API_PREFIX)
app.include_router(enrollment_router, prefix=settings.API_PREFIX)
app.include_router(monitoring_plans_router, prefix=settings.API_PREFIX)
app.include_router(checkins_router, prefix=settings.API_PREFIX)

@app.on_event("startup")
def seed_demo_data_if_empty():
    db = SessionLocal()
    try:
        # Check if doctor exists
        doctor = db.query(User).filter(User.email == "doctor@neurocare.org").first()
        if not doctor:
            doctor = User(
                email="doctor@neurocare.org",
                hashed_password=get_password_hash("Doctor123!"),
                full_name="Dr. Elena Vance, MD",
                role="doctor"
            )
            patient_user = User(
                email="patient@neurocare.org",
                hashed_password=get_password_hash("Patient123!"),
                full_name="Arthur Pendelton",
                role="patient"
            )
            db.add_all([doctor, patient_user])
            db.commit()
            db.refresh(doctor)
            db.refresh(patient_user)

            # Seed patient
            patient = Patient(
                user_id=patient_user.id,
                mrn="NC-2026-0841",
                first_name="Arthur",
                last_name="Pendelton",
                date_of_birth="1962-04-12",
                gender="Male",
                primary_condition_notes="Longitudinal motor and vocal monitoring following observed mild unilateral stiffness."
            )
            db.add(patient)
            db.commit()
            db.refresh(patient)

            # Seed personalized baselines
            baselines = [
                Baseline(patient_id=patient.id, domain="facial", feature_name="nasolabial_asymmetry_mm", mean_value=1.8, std_value=0.3, sample_count=5),
                Baseline(patient_id=patient.id, domain="facial", feature_name="blink_rate_bpm", mean_value=18.5, std_value=2.1, sample_count=5),
                Baseline(patient_id=patient.id, domain="motor", feature_name="finger_tap_amplitude_decay", mean_value=0.12, std_value=0.03, sample_count=5),
                Baseline(patient_id=patient.id, domain="motor", feature_name="resting_tremor_hz", mean_value=4.8, std_value=0.4, sample_count=5),
                Baseline(patient_id=patient.id, domain="vocal", feature_name="vocal_jitter_percent", mean_value=0.82, std_value=0.15, sample_count=5),
                Baseline(patient_id=patient.id, domain="vocal", feature_name="harmonics_to_noise_ratio_db", mean_value=23.4, std_value=1.8, sample_count=5),
            ]
            db.add_all(baselines)
            db.commit()

            # Seed initial assessment & report
            assessment = Assessment(
                patient_id=patient.id,
                clinician_id=doctor.id,
                assessment_type="multimodal_standard",
                status="completed",
                quality_gate_passed=True,
                quality_notes="Optimal lighting and clear acoustics verified.",
                is_simulated=True
            )
            db.add(assessment)
            db.commit()
            db.refresh(assessment)

            features = [
                Feature(assessment_id=assessment.id, domain="facial", feature_name="nasolabial_asymmetry_mm", value=1.9, unit="mm", confidence=0.92, is_simulated=True),
                Feature(assessment_id=assessment.id, domain="facial", feature_name="blink_rate_bpm", value=17.8, unit="bpm", confidence=0.95, is_simulated=True),
                Feature(assessment_id=assessment.id, domain="motor", feature_name="finger_tap_amplitude_decay", value=0.14, unit="ratio", confidence=0.89, is_simulated=True),
                Feature(assessment_id=assessment.id, domain="motor", feature_name="resting_tremor_hz", value=4.9, unit="Hz", confidence=0.91, is_simulated=True),
                Feature(assessment_id=assessment.id, domain="vocal", feature_name="vocal_jitter_percent", value=0.85, unit="%", confidence=0.96, is_simulated=True),
                Feature(assessment_id=assessment.id, domain="vocal", feature_name="harmonics_to_noise_ratio_db", value=22.8, unit="dB", confidence=0.94, is_simulated=True),
            ]
            db.add_all(features)
            db.commit()

            finding = Finding(
                assessment_id=assessment.id,
                domain="motor",
                finding_title="Motor Kinematics Evaluation",
                explanation="Finger tapping cadence and tremor frequency align closely with personalized historical baseline.",
                evidence_metrics='{"finger_tap_decay": 0.14, "baseline": 0.12, "resting_tremor_hz": 4.9}',
                clinical_relevance="Nominal / Stable compared to baseline",
                requires_review=False,
                status="acknowledged"
            )
            db.add(finding)

            report = Report(
                assessment_id=assessment.id,
                patient_id=patient.id,
                summary_text="Contactless multimodal evaluation completed. Features remain stable within 1 standard deviation of personalized baseline.",
                late_fusion_score=0.45,
                emergency_fast_triggered=False,
                explainability_notes="Computed using late fusion across facial, motor, and vocal channels. Traceable to raw kinematic metrics.",
                is_simulated=True,
                approved_by_doctor=True,
                approved_by_user_id=doctor.id
            )
            db.add(report)

            # Seed patient consent and monitoring plan
            consent = PatientConsent(
                patient_id=patient.id,
                consent_version="v1.0",
                consent_features=True,
                consent_evidence_clips=False,
                consent_research=False,
                signature_name="Arthur Pendelton",
                is_revoked=False
            )
            db.add(consent)

            plan = MonitoringPlan(
                patient_id=patient.id,
                clinician_id=doctor.id,
                assessment_types="finger_tapping,speech",
                frequency="daily",
                start_date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                duration_days=60,
                reminder_time="09:00",
                reminder_enabled=True,
                is_active=True
            )
            db.add(plan)
            db.commit()
    finally:
        db.close()
