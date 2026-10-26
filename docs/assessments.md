# NeuroCare Assessment Battery: Clinical & Algorithmic Specifications

NeuroCare provides a comprehensive battery of six contactless neurological assessments designed to quantify motor, vocal, facial, postural, and cognitive behavioral indicators.

---

## 1. Finger Tapping (Motor Kinematics)
*Clinical Analogue: MDS-UPDRS Part III, Item 3.4*

### Objective
Measures bradykinesia, rhythm irregularity, and progressive amplitude decrement (fatigue) during repetitive index finger and thumb opposition.

### Protocol
- **Duration**: 10 seconds per hand.
- **Positioning**: Hand positioned 30–50 cm in front of the camera, palm facing forward, fingers clearly visible.
- **Task**: The patient taps their index finger against the thumb as rapidly and widely as possible.

### Extracted Kinematic Features
- `finger_tap_frequency_hz`: Mean tapping cadence (typical healthy range: 2.5–4.5 Hz).
- `finger_tap_amplitude_decay`: Linear slope of tap amplitude over time; negative slopes indicate progressive amplitude reduction characteristic of parkinsonian fatigue.
- `tap_interval_cv`: Coefficient of variation of inter-tap intervals, quantifying dysrhythmia.
- `resting_tremor_hz`: Power spectral density peak in 3–7 Hz band during baseline rest periods.

---

## 2. Speech & Voice Assessment (Acoustic Biomarkers)
*Clinical Analogue: Dysarthria & Hypophonia Screening*

### Objective
Quantifies vocal stability, glottal closure, articulatory coordination, and prosodic variation across multilingual prompts (English, Tamil, Hindi).

### Protocol Tasks
1. **Sustained Phonation**: Steady `/a/` sound for 5 seconds at conversational volume.
2. **Diadochokinetic (DDK) Rate**: Rapid repetition of `/pa-ta-ka/` syllables for 8 seconds.
3. **Standardized Reading Passage**: Phonetically balanced paragraph evaluating natural prosody and pause ratios.

### Extracted Acoustic Features
- `vocal_jitter_percent`: Cycle-to-cycle frequency variation (healthy < 1.0%).
- `vocal_shimmer_percent`: Cycle-to-cycle amplitude variation (healthy < 3.8%).
- `harmonics_to_noise_ratio_db`: Acoustic signal purity (healthy > 20 dB).
- `ddk_repetition_rate_hz`: Syllables per second during rapid alternations.
- `pause_duration_ratio`: Ratio of silence to active speech during reading.

---

## 3. Facial Movement & Expression (Cranial Nerve VII)
*Clinical Analogue: House-Brackmann & FAST Protocol*

### Objective
Detects subtle unilateral facial paresis, masking (hypomimia), and voluntary mobility degradation.

### Protocol Tasks
1. Neutral resting face (evaluates spontaneous blink rate and resting nasolabial asymmetry).
2. Maximal smile (evaluates voluntary lip corner excursion symmetry).
3. Eye tight closure (evaluates orbicularis oculi force symmetry).

### Extracted Facial Features
- `nasolabial_asymmetry_mm`: Bilateral Euclidean difference between subnasale and oral commissures.
- `blink_rate_bpm`: Spontaneous blinks per minute (reduced in parkinsonism; healthy: 15–25 bpm).
- `smile_excursion_asymmetry`: Difference in bilateral commissure displacement during smile.

> **Emergency FAST Alert**: If acute unilateral asymmetry exceeds 4.5 mm or smile asymmetry exceeds 30%, the system flags the **FAST Protocol** and displays an emergency banner.

---

## 4. Gait Assessment (Locomotion & Asymmetry)
*Clinical Analogue: 5-Meter Timed Walk Test*

### Objective
Quantifies lower-body kinematic symmetry, cadence, step consistency, and arm-swing attenuation without wearable accelerometers.

### Protocol
- **Path**: Approximately 5 meters of unobstructed indoor walking.
- **Camera View**: Side or frontal view capturing full body from ankles to shoulders.

### Extracted Gait Features
- `cadence_steps_per_min`: Step frequency (typical: 95–125 steps/min).
- `step_symmetry_ratio`: Ratio of left to right step duration ($1.0 = \text{symmetric}$).
- `arm_swing_asymmetry`: Discrepancy between left and right wrist excursion angles (early sign of unilateral motor impairment).
- `turning_duration_sec`: Time taken to execute a 180-degree turnaround.

---

## 5. Balance Assessment (Postural Stability)
*Clinical Analogue: Modified Romberg / Tandem Stance*

### Safety First Protocol
Before starting, patients **must pass a safety pre-screen**:
1. Stable environment confirmation.
2. Sturdy chair or wall within reach.
3. If feeling unsteady, the patient can tap "Skip Test" without penalty; the system logs the session safely and redistributes fusion weights without inventing pathology.

### Extracted Balance Features
- `medial_lateral_sway_velocity`: Rate of lateral center-of-mass oscillation.
- `anterior_posterior_sway_velocity`: Sagittal sway velocity.
- `postural_stability_score`: Normalized stability index based on sway area and variance.

---

## 6. Cognitive Assessment (Executive Function & Psychomotor Speed)
*Clinical Analogue: Trail Making Test Part A & B*

### Objective
Evaluates visual search speed, motor sequencing, processing velocity, and mental flexibility.

### Protocol
- **Trail A**: Connect numbers sequentially ($1 \rightarrow 2 \rightarrow 3 \rightarrow \dots$).
- **Trail B**: Alternate between numbers and letters ($1 \rightarrow A \rightarrow 2 \rightarrow B \rightarrow \dots$).

### Extracted Cognitive Features
- `trail_a_duration_sec`: Visual search and motor execution speed.
- `trail_b_duration_sec`: Executive task-switching duration.
- `trail_b_a_ratio`: Normalized executive cost ($\text{Trail B} / \text{Trail A}$).
- `cognitive_error_count`: Number of incorrect sequential connections attempted.
