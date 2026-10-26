# NeuroCare REST API Reference

The NeuroCare backend exposes a RESTful API powered by FastAPI. All endpoints are prefixed by `/api/v1` and document OpenAPI/Swagger schemas at `/docs`.

---

## 1. Authentication (`/api/v1/auth`)

### `POST /auth/login`
Authenticates a user and returns an asymmetric JWT Bearer token.
- **Request Body**: `OAuth2PasswordRequestForm` (`username`, `password`)
- **Response `200 OK`**:
  ```json
  {
    "access_token": "eyJhbGciOiJIUzI1NiIsIn...",
    "token_type": "bearer",
    "user": {
      "id": 1,
      "email": "doctor@neurocare.org",
      "full_name": "Dr. Elena Vance, MD",
      "role": "doctor"
    }
  }
  ```

### `GET /auth/me`
Retrieves currently authenticated user details.
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Response `200 OK`**: User profile object.

---

## 2. Patients & Enrollment (`/api/v1/patients`, `/api/v1/enrollment`)

### `GET /patients`
Retrieves patient directory accessible to the authenticated doctor.
- **Role**: `doctor`

### `POST /enrollment/invite`
Generates a secure enrollment invitation token and registration URL for a new patient.
- **Role**: `doctor`
- **Request Body**:
  ```json
  {
    "mrn": "NC-2026-9021",
    "first_name": "Jane",
    "last_name": "Doe",
    "date_of_birth": "1968-11-23",
    "gender": "Female",
    "primary_condition_notes": "Suspected early tremor and speech inflection change."
  }
  ```
- **Response `200 OK`**: Returns `invite_token`, `invite_url`, and expiry.

### `POST /enrollment/register`
Self-enrollment endpoint for patients using an invitation token.
- **Request Body**: `invite_token`, `email`, `password`, `signature_name`, `consent_features`, `consent_evidence_clips`.

---

## 3. Assessments & Behavioral Features (`/api/v1/assessments`, `/api/v1/features`)

### `POST /assessments`
Records a newly completed assessment session.
- **Request Body**:
  ```json
  {
    "patient_id": 1,
    "assessment_type": "finger_tapping",
    "status": "completed",
    "quality_overall": "valid",
    "quality_reasons": ["Good lighting", "Confidence 0.94", "FPS 28.4"]
  }
  ```

### `POST /features/batch`
Submits extracted kinematic and acoustic metrics for an assessment.
- **Request Body**:
  ```json
  {
    "assessment_id": 12,
    "features": [
      {
        "domain": "motor",
        "feature_name": "finger_tap_frequency_hz",
        "value": 3.8,
        "unit": "Hz",
        "confidence": 0.92
      },
      {
        "domain": "motor",
        "feature_name": "finger_tap_amplitude_decay",
        "value": 0.18,
        "unit": "ratio",
        "confidence": 0.90
      }
    ]
  }
  ```

---

## 4. Personalized Baselines & Longitudinal Intelligence (`/api/v1/baselines`, `/api/v1/longitudinal`)

### `GET /baselines/{patient_id}`
Retrieves established median and MAD baselines for a patient across all assessed domains.

### `GET /longitudinal/{patient_id}`
Computes longitudinal trend trajectories, recovery metrics, and CUSUM change points.
- **Response `200 OK`**:
  ```json
  {
    "patient_id": 1,
    "recovery": {
      "overall_recovery_index": 92.4,
      "domain_indices": {
        "motor": 88.5,
        "speech": 96.0,
        "facial": 94.2
      },
      "status": "Stable"
    },
    "change_detection": {
      "finger_tap_frequency_hz": {
        "classification": "Stable",
        "cusum_score": 0.42,
        "is_persistent": false
      }
    }
  }
  ```

---

## 5. Grounded AI Assistant & Clinical SOAP (`/api/v1/ai`)

### `POST /ai/chat`
Conversational endpoint grounded strictly in patient monitoring records.
- **Role**: `doctor` or `patient` (strictly isolated to own MRN)
- **Request Body**:
  ```json
  {
    "patient_id": 1,
    "message": "Explain how Arthur's finger tapping amplitude has changed over the last 30 days."
  }
  ```
- **Response `200 OK`**:
  ```json
  {
    "response": "Over the last 30 days, Arthur's finger tapping amplitude decay averaged 0.14 ratio, which remains within 0.8 standard deviations of his baseline (0.12). Recording quality was valid across all sessions.",
    "provenance_tools": ["get_patient_baseline", "get_recent_assessments"],
    "requires_emergency_fast": false,
    "confidence_rating": "high"
  }
  ```

### `POST /ai/generate-summary`
Synthesizes an assistive clinical SOAP note for clinician review and approval.
- **Role**: `doctor`
- **Request Body**: `patient_id`
- **Response `200 OK`**: Structured `ClinicalSummary` with Subjective, Objective, Assessment, and Plan fields ready for one-click doctor sign-off.
