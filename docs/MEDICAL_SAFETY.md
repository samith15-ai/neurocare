# NeuroCare Medical Safety & Ethical Guidelines

## Medical Safety Core Principles

NeuroCare is an assistive, explainable clinical decision-support and longitudinal monitoring prototype. It is NOT an autonomous diagnostic medical device.

### 1. Mandatory Prohibitions
- **NEVER Diagnose Diseases**: Under no circumstances does the system diagnose Parkinson's disease, Amyotrophic Lateral Sclerosis (ALS), Stroke, Essential Tremor, or any other condition.
- **NEVER Output Disease Probabilities**: Arbitrary disease likelihood percentages (e.g., "78% risk of Parkinson's") are strictly prohibited.
- **NEVER Claim Doctor Omission**: The system will never state or imply that a clinician missed a symptom or made an error.
- **NEVER Fabricate or Impute Missing Biomarkers**: If a feature cannot be extracted due to occlusion, poor lighting, or missing sensory channels, it must be marked as `Not assessed`.

### 2. Approved Clinical Terminology
- *"Observed change"*
- *"Possible clinical relevance"*
- *"May warrant clinical review"*
- *"Not assessed"*
- *"Insufficient recording quality"*

### 3. Quality Gate: Quality is Not Pathology
A patient with poor camera lighting, shaky hand framing, or low microphone signal-to-noise ratio must NEVER be flagged as having a motor or vocal abnormality. The assessment must be flagged with `Insufficient recording quality` and guide the user on how to correct capture conditions.

### 4. Emergency FAST Protocol
If an acute asymmetry in facial landmarks, significant pronator drift, or sudden speech dysarthria is detected during capture or reported by the patient:
- NeuroCare renders an immediate, un-dismissible high-priority Emergency Alert Banner.
- Directs the patient or caregiver to immediately contact emergency services (e.g., call 911 or local emergency helpline).
- Never advises waiting for another assessment or scheduling a future check-in.
