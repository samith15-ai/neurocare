# NeuroCare: Contactless Multimodal System for Personalized Neurological Monitoring

[![Monorepo CI](https://github.com/medaithon/neurocare/actions/workflows/ci.yml/badge.svg)](https://github.com/medaithon/neurocare/actions)
**Context:** Medaithon Hackathon — Neurology Problem MED-PS-002

NeuroCare enables clinicians to perform rapid, contactless camera- and microphone-based assessments of neurological behavioral features (facial expressivity, motor kinematics, and vocal acoustics), generate explainable, evidence-linked clinical reports, and track longitudinal deviations from individualized baselines.

---

## Key Highlights

- **Single Codebase Architecture**: Shared React + TypeScript frontend powering Web, installable PWA, Android, and iOS (via Capacitor).
- **FastAPI + PostgreSQL Backend**: RESTful APIs with Pydantic validation, SQLAlchemy ORM, Alembic migrations, and SQLite fallback for instant zero-dependency local dev.
- **Multimodal Feature Extraction**: Computer vision (MediaPipe facial landmarks, pose tracking, hand tremor / tap kinematics) and acoustic analysis.
- **Strict Medical Safety**: Interpretable late fusion; adheres to non-diagnostic decision support rules ("quality is not pathology", "missing is not abnormal").
- **Emergency FAST Protocol**: Instant un-dismissible alert banner on acute stroke/neurological symptoms.

---

## Directory Structure

```text
NeuroCare/
├── web/                 # Shared React + TypeScript + Vite + Tailwind CSS frontend
├── api/                 # Python FastAPI backend + Pytest test suite
├── config/              # Versioned clinical thresholds & scoring weights
├── mobile/              # Capacitor mobile configuration
├── docs/                # Architecture and Medical Safety documentation
├── scripts/             # Local dev runner scripts
├── docker-compose.yml   # Multi-service container specification
├── .env.example         # Template environment configuration
└── README.md
```

---

## Quickstart

### Prerequisites
- Node.js >= 18
- Python >= 3.11

### 1. Backend Setup
```bash
cd api
python -m venv .venv
# Windows:
.\.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
pytest
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd web
npm install
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173) in your browser.
Interactive API documentation is at [http://localhost:8000/docs](http://localhost:8000/docs).
