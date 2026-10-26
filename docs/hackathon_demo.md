# NeuroCare Hackathon Demonstration Script (MED-PS-002)

This document provides a step-by-step walkthrough for evaluating and demonstrating NeuroCare to clinicians, hackathon judges, and review panels.

---

## 1. Demo Credentials & Environment

| Role | Email | Password | Access Dashboard |
|:---|:---|:---|:---|
| **Attending Neurologist** | `doctor@neurocare.org` | `Doctor123!` | `/doctor` (Doctor Portal) |
| **Monitored Patient** | `patient@neurocare.org` | `Patient123!` | `/patient` (Patient Portal) |

- **Local Web Frontend**: `http://127.0.0.1:5173`
- **FastAPI API & OpenAPI Docs**: `http://127.0.0.1:8000/docs`
- **Native Android APK**: `web/android/app/build/outputs/apk/debug/app-debug.apk`

---

## 2. Walkthrough Flow: Step-by-Step

### Scene 1: Clinician Patient Management & Enrollment
1. Open `http://127.0.0.1:5173/login` and sign in as `doctor@neurocare.org`.
2. Observe the **Doctor Dashboard**:
   - Active patient roster with individual risk indicators and longitudinal deviation flags.
   - Click **"Enroll New Patient"**: generates a secure invite link and QR code with customizable monitoring parameters (finger tapping, speech, daily check-in schedule).
   - Review patient **Arthur Pendelton (NC-2026-0841)**.

### Scene 2: Patient Daily Check-In & Assessment Battery
1. Open a private window or log out and sign in as `patient@neurocare.org`.
2. Notice the **Patient Dashboard**:
   - Personalized Daily Checklist with remaining scheduled tasks.
   - Compliance streak counter and established personal baseline badge.
3. Start **Finger Tapping Assessment**:
   - Observe camera preview and automatic **Quality Gate** validation (lighting, hand centering, 15+ FPS tracking).
   - Tap 10 seconds: real-time live tap amplitude graph updates with zero UI lag via dedicated Web Workers.
4. Start **Speech Assessment**:
   - Switch language prompt between English, Tamil, and Hindi.
   - Sustained "aaah" phonation: real-time microphone SNR and pitch tracking.
5. Demonstrate **Balance Safety Screen**:
   - Pre-screen confirms safe chair support; show that pressing "Skip for Safety" safely skips balance without generating false pathology.

### Scene 3: Acute Emergency Alert (FAST Protocol)
1. Simulate acute facial asymmetry in the testing panel or review Arthur's emergency alert history.
2. Observe the **Emergency FAST Alert Banner**:
   - Immediate warning regarding observed unilateral facial drooping.
   - 1-click **"Call 911"** emergency dial button and localized clinical guidance.
   - System refuses to label this as standard gradual monitoring fluctuation.

### Scene 4: Longitudinal Intelligence & Change-Point Analytics
1. Switch back to `doctor@neurocare.org` and view Arthur's **Longitudinal Monitoring Tab**:
   - Multi-week trajectory charts for Motor, Vocal, and Facial domains.
   - **CUSUM Change-Point Indicator**: shows estimated monitoring change date without mislabeling it as "disease onset".
   - **Overall Recovery Index**: 0–100 scale quantifying trajectory toward baseline.

### Scene 5: Grounded AI Assistant & Clinical SOAP Sign-Off
1. On Arthur's patient record, open the **AI Assistant**:
   - Ask: *"What changes have been observed in Arthur's speech over the past 2 weeks?"*
   - Verify tool grounding: the AI cites `get_modality_trends` and reports exact acoustic numbers (e.g. jitter 0.85%, HNR 22.8 dB).
   - Ask: *"Does Arthur have Parkinson's disease?"*
   - Verify guardrail refusal: the AI reminds that NeuroCare is an assistive behavioral monitoring tool and does not generate medical diagnoses.
2. Click **"Generate Clinician Summary"**:
   - The AI generates a structured SOAP note (Subjective, Objective, Assessment, Plan).
   - The doctor reviews, edits the recommendations, and clicks **"Approve & Sign SOAP Summary"**.
   - An immutable cryptographic audit log is generated.

### Scene 6: Cross-Platform & Offline Demonstration
1. In Chrome/Edge DevTools, toggle **Offline Mode** in the Network tab.
2. Complete an assessment: data saves seamlessly to local IndexedDB via Dexie.js.
3. Toggle back to **Online Mode**: the client automatically reconciles pending reports with the backend.
4. Demonstrate PWA installation via the "Install App" button in the navigation bar.
5. Present the generated native Android APK (`app-debug.apk`) running on the native Android runtime.
