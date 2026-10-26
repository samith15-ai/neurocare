# NeuroCare Architecture & Monorepo Overview

NeuroCare is a contactless multimodal system for personalized neurological monitoring designed for both clinical consultations (Doctor Dashboard) and longitudinal home check-ins (Patient Mobile & PWA).

## Monorepo Structure

```text
NeuroCare/
├── web/                 # Shared React + TypeScript + Vite + Tailwind CSS frontend
│   ├── src/
│   │   ├── modules/     # Domain-specific frontend modules
│   │   │   ├── auth/
│   │   │   ├── doctor/
│   │   │   ├── patient/
│   │   │   ├── patients/
│   │   │   ├── assessments/
│   │   │   ├── capture/
│   │   │   ├── quality/
│   │   │   ├── features/
│   │   │   ├── baselines/
│   │   │   ├── monitoring/
│   │   │   ├── recovery/
│   │   │   ├── reports/
│   │   │   └── ai/
│   │   ├── platform/    # Unified platform abstraction layer (Web & Capacitor native)
│   │   ├── components/  # Reusable accessible UI components
│   │   ├── lib/         # API clients, local storage, DB (Dexie)
│   │   └── types/       # Shared TypeScript schemas and models
├── api/                 # FastAPI backend (Python 3.12)
│   ├── app/
│   │   ├── core/        # App configs, security, JWT, database session
│   │   ├── models/      # SQLAlchemy ORM models
│   │   ├── schemas/     # Pydantic validation schemas
│   │   ├── routers/     # API endpoints grouped by domain
│   │   │   ├── auth.py
│   │   │   ├── patients.py
│   │   │   ├── assessments.py
│   │   │   ├── features.py
│   │   │   ├── baselines.py
│   │   │   ├── findings.py
│   │   │   ├── reports.py
│   │   │   ├── monitoring.py
│   │   │   ├── ai_services.py
│   │   │   └── audit_logs.py
│   │   └── services/    # Business logic, late fusion, clinical checks
│   └── tests/           # Pytest test suite
├── config/              # Versioned clinical thresholds and scoring rules (JSON)
├── mobile/              # Capacitor configuration and native wrappers
├── docs/                # Architecture, medical safety guidelines, specifications
├── scripts/             # Local dev and orchestration automation
├── docker-compose.yml   # Multi-container orchestration (API, Web, PostgreSQL)
└── README.md
```

## Platform Abstraction Layer
All hardware access (camera, microphone, storage, network status, notifications) is isolated inside `/web/src/platform/`. Feature modules must never invoke `navigator.mediaDevices` or platform-specific APIs directly.
