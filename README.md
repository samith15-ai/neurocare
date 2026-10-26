# NeuroCare: Contactless Multimodal System for Personalized Neurological Monitoring

[![Medaithon Track MED-PS-002](https://img.shields.io/badge/Medaithon-MED--PS--002-blue.svg)](https://medaithon.org)
[![Live Web Application](https://img.shields.io/badge/Live%20Demo-neurocare--inky.vercel.app-success.svg)](https://neurocare-inky.vercel.app)
[![API Documentation](https://img.shields.io/badge/API%20Docs-neurocare--38kr.onrender.com-blue.svg)](https://neurocare-38kr.onrender.com/docs)
[![Database: Supabase](https://img.shields.io/badge/Database-Supabase%20PostgreSQL-3ECF8E.svg?logo=supabase&logoColor=white)](https://supabase.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React 19](https://img.shields.io/badge/React-19.3-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Capacitor 8](https://img.shields.io/badge/Capacitor-8.5-119EFF.svg?logo=capacitor&logoColor=white)](https://capacitorjs.com)
[![Test Suite: 103 Passed](https://img.shields.io/badge/Tests-103%20Passed%20(100%25)-success.svg)](https://pytest.org)

NeuroCare is an AI-powered, contactless multimodal neurological monitoring platform developed for **Medaithon Track MED-PS-002**. By combining computer vision, acoustic signal processing, and longitudinal statistical intelligence, NeuroCare measures and tracks subtle changes in motor kinematics, vocal acoustics, facial expressivity, gait, balance, and cognitive psychomotor speed — directly from everyday smartphones, tablets, or web browsers without requiring wearable sensors or specialized clinical hardware.

---

## 🌐 Live Production Deployments

- **Live Web & PWA Portal:** **[https://neurocare-inky.vercel.app](https://neurocare-inky.vercel.app)**
- **Live API & Swagger Docs:** **[https://neurocare-38kr.onrender.com/docs](https://neurocare-38kr.onrender.com/docs)**
- **Managed Database:** Supabase PostgreSQL 17 (`aws-0-ap-south-1`)

### 👥 Demo Credentials
- **Doctor Portal:** `doctor@neurocare.org` / `Doctor123!`
- **Patient Portal:** `patient@neurocare.org` / `Patient123!`

---

## 🌟 Key Platform Capabilities

1. **6-Assessment Battery**:
   - **Finger Tapping**: Motor speed, amplitude decrement (fatigue), rhythm CV, resting tremor.
   - **Speech & Voice**: Sustained phonation, `/pa-ta-ka/` DDK rate, reading prosody (multilingual: English, Tamil, Hindi).
   - **Facial Movement**: Spontaneous blink rate, smile excursion asymmetry, nasolabial fold asymmetry.
   - **Gait Analysis**: 5-meter walking cadence, step symmetry ratio, arm-swing asymmetry, turning duration.
   - **Balance Assessment**: Postural sway with mandatory safety pre-screen and zero-penalty skip option.
   - **Cognitive Testing**: Digital Trail Making Tests A & B measuring visual search speed and executive task switching.

2. **Personalized Baseline & Longitudinal Intelligence**:
   - Computes robust individual baselines using median and Median Absolute Deviation (MAD $\times 1.4826$).
   - Statistical change-point detection via **CUSUM** and multi-session persistence tracking.
   - 0–100 **Overall Recovery Index** tracking trajectories back toward healthy baselines.

3. **Grounded AI Clinical Assistant & SOAP Generator**:
   - Tool-governed assistant strictly bound to 6 backend analytical functions.
   - Strict medical safety guardrails: refuses speculative disease diagnoses; avoids unsupported probabilities.
   - Clinician-supervised SOAP note generator (Subjective, Objective, Assessment, Plan) with one-click doctor sign-off.

4. **Emergency FAST Alert Protocol**:
   - Real-time screening for acute unilateral facial droop, limb weakness, or speech impairment.
   - Immediate un-dismissible alert banner with direct **"Call 911"** emergency dial button.

5. **Cross-Platform & Offline-First**:
   - Deployable as a **Web Application**, **Installable PWA**, **Native Android App (APK)**, and **iOS App**.
   - Offline recording cache powered by Dexie.js (IndexedDB) with automatic synchronization on reconnect.

---

## 📂 Repository Monorepo Structure

```text
NEUROCARE/
├── api/                           # FastAPI backend (Python 3.12)
│   ├── app/
│   │   ├── core/                  # Security, JWT, database, settings
│   │   ├── models/                # SQLAlchemy ORM models (Users, Baselines, Reports, etc.)
│   │   ├── routers/               # Domain endpoints (Auth, Patients, AI, Longitudinal, etc.)
│   │   ├── schemas/               # Pydantic V2 schemas
│   │   └── services/              # Scoring engine, CUSUM, Grounded AI assistant
│   ├── tests/                     # Pytest suite (44 tests, 100% passing)
│   ├── Dockerfile                 # Production backend container
│   └── requirements.txt
├── web/                           # React 19 + TypeScript frontend
│   ├── android/                   # Native Android Capacitor workspace (generates app-debug.apk)
│   ├── ios/                       # Native iOS Capacitor workspace (App.xcodeproj)
│   ├── public/                    # PWA icons, manifest, assets
│   ├── src/
│   │   ├── components/            # Accessible UI components (Navbar, EmergencyBanner, QualityGate)
│   │   ├── modules/               # Domain feature modules (Capture, Reports, AI, Monitoring, etc.)
│   │   ├── platform/              # Platform Abstraction Layer (Web & Capacitor bridges)
│   │   └── workers/               # Dedicated Web Workers for low-latency signal extraction
│   ├── Dockerfile                 # Multi-stage production Nginx container
│   ├── nginx.conf                 # Nginx caching, PWA routing, and reverse proxy
│   └── package.json               # Vitest suite (59 tests, 100% passing)
├── config/                        # Clinical thresholds & scoring rules (versioned JSON)
├── docs/                          # Comprehensive technical and clinical documentation
│   ├── architecture.md            # System architecture, Web Workers, late fusion math
│   ├── database.md                # ER diagram, SQLAlchemy models, auto-migration
│   ├── api_reference.md           # REST API endpoints and payload schemas
│   ├── assessments.md             # Scientific & clinical breakdown of all 6 assessments
│   └── hackathon_demo.md          # Step-by-step hackathon presentation script
├── docker-compose.yml             # Full-stack Docker orchestration (PostgreSQL + API + Web)
└── README.md                      # This overview document
```

---

## 🚀 Quickstart & Development

### 1. Prerequisites
- **Node.js**: `v20.x` or `v22.x`
- **Python**: `3.11` or `3.12`
- **Android SDK** (optional, for native Android build): Platform 35, Build-Tools 35.0.0

### 2. Backend Setup
```bash
# Navigate to API directory
cd api

# Create and activate virtual environment
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run backend development server (with auto-reload and SQLite seeding)
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```
The FastAPI documentation is available at `http://127.0.0.1:8000/docs`.

### 3. Frontend Setup
```bash
# Navigate to Web directory
cd web

# Install dependencies
npm install

# Run frontend development server
npm run dev
```
Open `http://127.0.0.1:5173` in your browser.

---

## 🧪 Testing Suite (103 Tests — 100% Passing)

NeuroCare maintains full unit and integration test coverage across both frontend and backend.

```bash
# Run Backend Tests (44 tests)
$env:PYTHONPATH="api"; .\api\.venv\Scripts\python.exe -m pytest api/tests

# Run Frontend Tests (59 tests across 9 suites)
cd web
npm test
```

---

## 🐳 Docker Production Deployment

Launch the entire stack (PostgreSQL 16 database, FastAPI backend, and Nginx PWA frontend) with a single command:

```bash
docker compose up --build -d
```
- **Web App / PWA**: `http://localhost:3000`
- **FastAPI Backend**: `http://localhost:8000`
- **PostgreSQL Database**: `localhost:5432`

---

## 📱 Cross-Platform Builds

### 1. Installable PWA
The production frontend compiles into an offline-first Progressive Web App with pre-cached assets:
```bash
cd web
npm run build
```
Users can install NeuroCare to their home screen or desktop directly via the **"Install App"** button in the navigation bar.

### 2. Native Android Build
The Android platform is managed via Capacitor.
```bash
cd web
# Build web distribution and sync native assets
npm run build
npx cap sync android

# Compile debug APK via Gradle
cd android
.\gradlew.bat assembleDebug
```
The compiled native Android binary is located at:
`web/android/app/build/outputs/apk/debug/app-debug.apk`

### 3. iOS Platform
The iOS platform is fully scaffolded with required camera and microphone permission declarations in `Info.plist`:
```bash
cd web
npm run build
npx cap sync ios
```
*Note: Generating an `.ipa` package requires an Apple macOS host with Xcode command-line tools.*

---

## 👥 Demo Accounts

| Role | Email | Password | Primary Feature |
|:---|:---|:---|:---|
| **Attending Neurologist** | `doctor@neurocare.org` | `Doctor123!` | Multi-patient roster, SOAP signing, AI assistant |
| **Monitored Patient** | `patient@neurocare.org` | `Patient123!` | 6-assessment battery, daily checklist, streaks |

---

## ⚕️ Clinical Safety & Regulatory Disclaimer

NeuroCare is designed as an **assistive behavioral monitoring tool** for clinicians and patients. It is **not** an autonomous diagnostic medical device and does **not** provide definitive diagnoses for conditions such as Parkinson's Disease, Stroke, ALS, or Bell's Palsy. All observations, metric trends, and AI-generated SOAP summaries must be reviewed and verified by a licensed medical professional before informing clinical decisions. In any case of suspected acute stroke or rapid neurological deterioration, immediate emergency care must be sought.
