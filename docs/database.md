# NeuroCare Database Architecture & Data Models

NeuroCare utilizes a robust relational schema managed through SQLAlchemy 2.0 ORM. The platform supports local development and offline environments via **SQLite 3**, while containerized and cloud production environments utilize **PostgreSQL 16**.

---

## 1. Entity-Relationship Diagram

```mermaid
erDiagram
    USERS ||--o{ PATIENTS : "manages/enrolled_as"
    USERS ||--o{ AUDIT_LOGS : "performs"
    PATIENTS ||--o{ ASSESSMENTS : "completes"
    PATIENTS ||--o{ BASELINES : "owns"
    PATIENTS ||--o{ MONITORING_PLANS : "assigned"
    PATIENTS ||--o{ PATIENT_CONSENTS : "grants"
    PATIENTS ||--o{ CLINICAL_SUMMARIES : "summarized_in"
    PATIENTS ||--o{ REPORTS : "receives"
    
    ASSESSMENTS ||--o{ FEATURES : "extracts"
    ASSESSMENTS ||--o{ FINDINGS : "produces"
    ASSESSMENTS ||--o{ REPORTS : "synthesizes"

    USERS {
        int id PK
        string email UK
        string hashed_password
        string full_name
        string role "doctor | patient | admin"
        boolean is_active
        datetime created_at
    }

    PATIENTS {
        int id PK
        int user_id FK
        string mrn UK "Medical Record Number"
        string first_name
        string last_name
        string date_of_birth
        string gender
        string primary_condition_notes
        datetime enrolled_at
    }

    ASSESSMENTS {
        int id PK
        int patient_id FK
        string assessment_type "finger_tapping | speech | facial | gait | balance | cognitive"
        string status "completed | partial | failed"
        string quality_overall "valid | limited | insufficient"
        string quality_reasons_json
        datetime created_at
    }

    FEATURES {
        int id PK
        int assessment_id FK
        string domain "motor | speech | facial | gait | balance | cognitive"
        string feature_name
        float value
        string unit
        float confidence
        boolean is_simulated
    }

    BASELINES {
        int id PK
        int patient_id FK
        string domain
        string feature_name
        float mean_value
        float std_value
        float median_value
        float mad_value
        float min_mad_floor
        int sample_count
        boolean is_established
        boolean is_frozen
        string status_message
    }

    REPORTS {
        int id PK
        int assessment_id FK
        int patient_id FK
        string summary_text
        float late_fusion_score
        boolean emergency_fast_triggered
        string overall_status "No flag | Monitoring Deviation | FAST Protocol"
        string domain_scores_json
        string doctor_feedback "approved | modified | rejected"
        string doctor_notes
        boolean approved_by_doctor
        int approved_by_user_id FK
    }

    MONITORING_PLANS {
        int id PK
        int patient_id FK
        int clinician_id FK
        string assessment_types
        string frequency "daily | weekly | biweekly"
        string start_date
        int duration_days
        string reminder_time
        boolean reminder_enabled
        boolean is_active
    }

    PATIENT_CONSENTS {
        int id PK
        int patient_id FK
        string consent_version
        boolean consent_features
        boolean consent_evidence_clips
        boolean consent_research
        string signature_name
        boolean is_revoked
        datetime created_at
    }

    CLINICAL_SUMMARIES {
        int id PK
        int patient_id FK
        int clinician_id FK
        string subjective
        string objective
        string assessment
        string plan
        string risk_level "low | moderate | high"
        boolean clinician_approved
        datetime approved_at
    }

    AUDIT_LOGS {
        int id PK
        int user_id FK
        string action
        string target_entity
        int target_id
        string ip_address
        string details_json
        datetime timestamp
    }
```

---

## 2. Table Specifications & Models

### `users` (`api/app/models/user.py`)
Stores credentials, role, and profile details. Role-based access control enforces strict isolation:
- `doctor`: Access to all assigned patients, clinical reports, SOAP summary generation, and monitoring plan assignment.
- `patient`: Access restricted exclusively to personal assessments, check-ins, reports, and AI assistant dialogues.

### `patients` (`api/app/models/patient.py`)
Clinical demographic profile, anonymized unique Medical Record Number (MRN), and clinician notes.

### `assessments` (`api/app/models/assessment.py`)
Represents an individual testing session. Carries config-driven quality gates (`valid`, `limited`, `insufficient`) along with human-readable diagnostic reasons.

### `features` (`api/app/models/feature.py`)
Granular kinematic, acoustic, or cognitive extracted metrics (e.g., `finger_tap_frequency_hz`, `vocal_jitter_percent`, `cadence_steps_per_min`, `trail_b_duration_sec`).

### `baselines` (`api/app/models/baseline.py`)
Stores the patient's individual behavioral baseline computed across at least 3 valid sessions using the median and Median Absolute Deviation (MAD).

### `patient_consents` (`api/app/models/consent.py`)
Explicit consent tracking for HIPAA / GDPR compliance:
- Granular permissions for extracted feature storage vs. video clip retention.
- Full revocation capability, which automatically purges all stored media from the system.

### `clinical_summaries` (`api/app/models/clinical_summary.py`)
Structured SOAP notes generated by the Grounded AI Assistant and approved by the clinician with cryptographic audit tracing.

### `audit_logs` (`api/app/models/audit_log.py`)
Immutable record of all patient data views, downloads, consent changes, and report sign-offs.

---

## 3. Database Migration & Compatibility

The system includes a zero-dependency **auto-migration engine** (`auto_migrate_sqlite` in `api/app/main.py`) that checks table definitions on startup and applies additive schema changes dynamically. This ensures existing SQLite development databases and production PostgreSQL databases upgrade seamlessly without data loss.
