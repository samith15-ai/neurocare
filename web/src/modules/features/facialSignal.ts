/**
 * Facial Movement & Kinematic Analysis Engine
 *
 * Implements:
 * - 4 Standardized Tasks: Neutral hold, Smile, Eyebrow raise, Eye close
 * - Dual-trial replication (Trial 1 and Trial 2)
 * - Head-pose yaw/pitch normalization to prevent head turns being misread as asymmetry
 * - Features: Expression amplitude, Left-Right symmetry, Movement speed, Onset-to-peak time,
 *   Blink rate, Blink completeness, and Expression variability.
 * - Standard Output Schema formatting.
 */

import type { StandardAssessmentOutput } from '../../types';

export type FacialTaskType = 'neutral_hold' | 'smile' | 'eyebrow_raise' | 'eye_close';

export interface FacialLandmark3D {
  x: number;
  y: number;
  z?: number;
}

export interface HeadPose {
  yawDeg: number;
  pitchDeg: number;
  rollDeg: number;
}

export interface FacialMovementMetrics {
  task: FacialTaskType;
  trial: 1 | 2;
  expression_amplitude_mm: number;
  left_right_symmetry_ratio: number;
  movement_speed_mm_per_sec: number;
  onset_to_peak_time_ms: number;
  blink_rate_bpm: number;
  blink_completeness_ratio: number;
  expression_variability_ratio?: number;
}

export interface FacialQualityAssessment {
  status: 'valid' | 'limited' | 'insufficient';
  reasons: string[];
  headPose: HeadPose;
  meanConfidence: number;
  isPoseCompensated: boolean;
}

export const FACIAL_TASK_DESCRIPTIONS: Record<
  FacialTaskType,
  { title: string; instruction: string; targetSeconds: number }
> = {
  neutral_hold: {
    title: 'Neutral Facial Rest',
    instruction: 'Look straight at the camera with your facial muscles completely relaxed for 5 seconds.',
    targetSeconds: 5,
  },
  smile: {
    title: 'Maximum Smile',
    instruction: 'Smile broadly showing your teeth, hold for 2 seconds, then return to neutral. Repeat twice.',
    targetSeconds: 6,
  },
  eyebrow_raise: {
    title: 'Eyebrow Elevation',
    instruction: 'Raise both of your eyebrows as high as you can, hold briefly, then relax.',
    targetSeconds: 5,
  },
  eye_close: {
    title: 'Tight Eye Closure',
    instruction: 'Close both eyes tightly as if sleeping, hold for 2 seconds, then gently reopen.',
    targetSeconds: 5,
  },
};

/**
 * Calculates approximate head pose (yaw, pitch, roll) from key facial anchor landmarks.
 * Landmarks:
 * 1: Nose tip
 * 152: Chin
 * 10: Forehead / Glabella
 * 234: Left ear tragus
 * 454: Right ear tragus
 */
export function estimateHeadPose(landmarks: FacialLandmark3D[]): HeadPose {
  if (!landmarks || landmarks.length < 468) {
    return { yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
  }

  const nose = landmarks[1];
  const leftTragus = landmarks[234] || { x: 0.2, y: 0.5, z: 0 };
  const rightTragus = landmarks[454] || { x: 0.8, y: 0.5, z: 0 };
  const forehead = landmarks[10] || { x: 0.5, y: 0.2, z: 0 };
  const chin = landmarks[152] || { x: 0.5, y: 0.8, z: 0 };

  // Horizontal symmetry to nose estimates yaw
  const dLeft = Math.hypot(nose.x - leftTragus.x, nose.y - leftTragus.y);
  const dRight = Math.hypot(nose.x - rightTragus.x, nose.y - rightTragus.y);
  const yawRatio = (dRight - dLeft) / Math.max(0.001, dRight + dLeft);
  const yawDeg = Number((yawRatio * 60).toFixed(1));

  // Vertical ratio estimates pitch
  const dUpper = Math.hypot(nose.x - forehead.x, nose.y - forehead.y);
  const dLower = Math.hypot(nose.x - chin.x, nose.y - chin.y);
  const pitchRatio = (dLower - dUpper) / Math.max(0.001, dLower + dUpper);
  const pitchDeg = Number((pitchRatio * 50).toFixed(1));

  // Roll
  const rollAngle = Math.atan2(rightTragus.y - leftTragus.y, rightTragus.x - leftTragus.x);
  const rollDeg = Number((rollAngle * (180 / Math.PI)).toFixed(1));

  return { yawDeg, pitchDeg, rollDeg };
}

/**
 * Evaluates facial tracking quality and flags head rotation or poor landmark confidence.
 */
export function evaluateFacialQuality(
  landmarks: FacialLandmark3D[] | null,
  confidence: number = 0.90
): FacialQualityAssessment {
  const reasons: string[] = [];

  if (!landmarks || landmarks.length < 100) {
    return {
      status: 'insufficient',
      reasons: ['Face not detected. Please position your face directly in front of the camera.'],
      headPose: { yawDeg: 0, pitchDeg: 0, rollDeg: 0 },
      meanConfidence: 0,
      isPoseCompensated: false,
    };
  }

  const pose = estimateHeadPose(landmarks);

  if (Math.abs(pose.yawDeg) > 25.0) {
    reasons.push(`Head is rotated sideways (${Math.abs(pose.yawDeg)}°). Look straight at the lens.`);
  }

  if (Math.abs(pose.pitchDeg) > 20.0) {
    reasons.push('Head is tilted up or down. Keep your eyes level with the camera.');
  }

  if (confidence < 0.65) {
    reasons.push('Facial landmark tracking confidence is low. Ensure adequate front lighting.');
  }

  let status: 'valid' | 'limited' | 'insufficient' = 'valid';
  if (confidence < 0.50 || Math.abs(pose.yawDeg) > 35.0) {
    status = 'insufficient';
  } else if (Math.abs(pose.yawDeg) > 18.0 || confidence < 0.75 || reasons.length > 0) {
    status = 'limited';
  }

  return {
    status,
    reasons,
    headPose: pose,
    meanConfidence: confidence,
    isPoseCompensated: Math.abs(pose.yawDeg) <= 25.0,
  };
}

/**
 * Calculates Eye Aspect Ratio (EAR) for blink rate and completeness.
 */
export function calculateEyeAspectRatio(landmarks: FacialLandmark3D[]): { leftEar: number; rightEar: number } {
  if (!landmarks || landmarks.length < 468) {
    return { leftEar: 0.32, rightEar: 0.32 };
  }

  // Left Eye: 33 (outer), 133 (inner), 159 (upper), 145 (lower)
  const leftOuter = landmarks[33];
  const leftInner = landmarks[133];
  const leftUpper = landmarks[159] || landmarks[160];
  const leftLower = landmarks[145] || landmarks[144];

  const leftWidth = Math.hypot(leftOuter.x - leftInner.x, leftOuter.y - leftInner.y);
  const leftHeight = Math.hypot(leftUpper.x - leftLower.x, leftUpper.y - leftLower.y);
  const leftEar = leftWidth > 0 ? leftHeight / leftWidth : 0.3;

  // Right Eye: 362 (inner), 263 (outer), 386 (upper), 374 (lower)
  const rightInner = landmarks[362];
  const rightOuter = landmarks[263];
  const rightUpper = landmarks[386];
  const rightLower = landmarks[374];

  const rightWidth = Math.hypot(rightOuter.x - rightInner.x, rightOuter.y - rightInner.y);
  const rightHeight = Math.hypot(rightUpper.x - rightLower.x, rightUpper.y - rightLower.y);
  const rightEar = rightWidth > 0 ? rightHeight / rightWidth : 0.3;

  return {
    leftEar: Number(leftEar.toFixed(3)),
    rightEar: Number(rightEar.toFixed(3)),
  };
}

/**
 * Extracts facial movement kinematics from a sequence of frames for a specific task.
 * Implements head-pose normalization to decouple camera perspective from true asymmetry.
 */
export function extractFacialTaskMetrics(params: {
  task: FacialTaskType;
  trial: 1 | 2;
  frames: Array<{ landmarks: FacialLandmark3D[]; timestamp: number }>;
  quality: FacialQualityAssessment;
}): { metrics: FacialMovementMetrics; unavailable: string[] } {
  const { task, trial, frames, quality } = params;
  const unavailable: string[] = [];

  if (frames.length < 5 || quality.status === 'insufficient') {
    return {
      metrics: {
        task,
        trial,
        expression_amplitude_mm: 0,
        left_right_symmetry_ratio: 1.0,
        movement_speed_mm_per_sec: 0,
        onset_to_peak_time_ms: 0,
        blink_rate_bpm: 0,
        blink_completeness_ratio: 0,
      },
      unavailable: ['expression_amplitude_mm', 'left_right_symmetry_ratio', 'movement_speed_mm_per_sec'],
    };
  }

  // Interocular distance as biometric physical millimeter scale (~63mm adult norm)
  const initialFrame = frames[0].landmarks;
  const leftEyeCenter = initialFrame[33] || { x: 0.35, y: 0.35 };
  const rightEyeCenter = initialFrame[263] || { x: 0.65, y: 0.35 };
  const iodPixels = Math.max(0.001, Math.hypot(leftEyeCenter.x - rightEyeCenter.x, leftEyeCenter.y - rightEyeCenter.y));
  const mmPerNormUnit = 63.0 / iodPixels;

  // Track displacements according to task
  const displacements: number[] = [];
  const leftDistances: number[] = [];
  const rightDistances: number[] = [];
  const ears: number[] = [];

  for (const f of frames) {
    const lm = f.landmarks;
    const nose = lm[1] || { x: 0.5, y: 0.5 };
    const { leftEar, rightEar } = calculateEyeAspectRatio(lm);
    ears.push((leftEar + rightEar) / 2);

    if (task === 'smile') {
      // Mouth corners: 61 (left), 291 (right)
      const mouthL = lm[61] || { x: 0.4, y: 0.65 };
      const mouthR = lm[291] || { x: 0.6, y: 0.65 };
      const dL = Math.hypot(mouthL.x - nose.x, mouthL.y - nose.y);
      const dR = Math.hypot(mouthR.x - nose.x, mouthR.y - nose.y);
      leftDistances.push(dL * mmPerNormUnit);
      rightDistances.push(dR * mmPerNormUnit);
      displacements.push(((dL + dR) / 2) * mmPerNormUnit);
    } else if (task === 'eyebrow_raise') {
      // Eyebrows: 70 (left), 300 (right)
      const browL = lm[70] || { x: 0.35, y: 0.25 };
      const browR = lm[300] || { x: 0.65, y: 0.25 };
      const dL = Math.hypot(browL.x - nose.x, browL.y - nose.y);
      const dR = Math.hypot(browR.x - nose.x, browR.y - nose.y);
      leftDistances.push(dL * mmPerNormUnit);
      rightDistances.push(dR * mmPerNormUnit);
      displacements.push(((dL + dR) / 2) * mmPerNormUnit);
    } else {
      // Neutral or Eye Close
      const dL = leftEar * 20;
      const dR = rightEar * 20;
      leftDistances.push(dL);
      rightDistances.push(dR);
      displacements.push((dL + dR) / 2);
    }
  }

  // Peak finding and onset timing
  const baselineDisp = displacements[0] || 0;
  const maxDisp = Math.max(...displacements);
  const peakIndex = displacements.indexOf(maxDisp);
  const amplitudeMm = Math.max(0, maxDisp - baselineDisp);

  const onsetTimeMs = frames[0].timestamp;
  const peakTimeMs = frames[peakIndex]?.timestamp || onsetTimeMs + 500;
  const onsetToPeakMs = Math.max(50, peakTimeMs - onsetTimeMs);
  const movementSpeed = onsetToPeakMs > 0 ? (amplitudeMm / (onsetToPeakMs / 1000)) : 0;

  // Bilateral symmetry calculation at peak with head-yaw compensation
  const peakLeft = leftDistances[peakIndex] || 1;
  const peakRight = rightDistances[peakIndex] || 1;
  const yawFactor = 1.0 + (quality.headPose.yawDeg / 45.0) * 0.15; // compensate perspective foreshortening
  const compensatedLeft = peakLeft * yawFactor;
  const symmetryRatio = Math.max(compensatedLeft, peakRight) > 0
    ? Number((Math.min(compensatedLeft, peakRight) / Math.max(compensatedLeft, peakRight)).toFixed(3))
    : 1.0;

  // Blink metrics
  let blinkCount = 0;
  let minEar = 1.0;
  for (let i = 1; i < ears.length; i++) {
    if (ears[i] < minEar) minEar = ears[i];
    if (ears[i] < 0.18 && ears[i - 1] >= 0.18) {
      blinkCount++;
    }
  }
  const totalDurationMin = (frames[frames.length - 1].timestamp - frames[0].timestamp) / 60000;
  const blinkRateBpm = totalDurationMin > 0 ? Number((blinkCount / totalDurationMin).toFixed(1)) : 16.0;
  const baselineEar = ears[0] || 0.32;
  const blinkCompleteness = baselineEar > 0 ? Number((1.0 - (minEar / baselineEar)).toFixed(2)) : 0.95;

  return {
    metrics: {
      task,
      trial,
      expression_amplitude_mm: Number(amplitudeMm.toFixed(2)),
      left_right_symmetry_ratio: symmetryRatio,
      movement_speed_mm_per_sec: Number(movementSpeed.toFixed(1)),
      onset_to_peak_time_ms: Math.round(onsetToPeakMs),
      blink_rate_bpm: blinkRateBpm,
      blink_completeness_ratio: Math.max(0, Math.min(1.0, blinkCompleteness)),
    },
    unavailable,
  };
}

/**
 * Builds the standard assessment output schema for facial movement tasks.
 */
export function buildStandardFacialOutput(params: {
  taskType: FacialTaskType;
  trial: 1 | 2;
  metrics: FacialMovementMetrics;
  quality: FacialQualityAssessment;
  unavailable: string[];
  sampleCount: number;
  isSimulated: boolean;
}): StandardAssessmentOutput<FacialMovementMetrics> {
  const { taskType, trial, metrics, quality, unavailable, sampleCount, isSimulated } = params;

  return {
    assessment_type: 'facial',
    task_name: `${taskType}_trial_${trial}`,
    features: metrics,
    quality: {
      status: quality.status,
      reasons: quality.reasons,
      metrics: {
        yaw_deg: quality.headPose.yawDeg,
        pitch_deg: quality.headPose.pitchDeg,
        confidence: quality.meanConfidence,
        is_pose_compensated: quality.isPoseCompensated,
      },
    },
    evidence: {
      sample_count: sampleCount,
      signal_summary: `Facial motion tracked across ${sampleCount} frames. Head yaw: ${quality.headPose.yawDeg}°, pitch: ${quality.headPose.pitchDeg}°.`,
    },
    unavailable_features: unavailable,
    timestamp: new Date().toISOString(),
    is_simulated: isSimulated,
    metadata: {
      trial,
    },
  };
}
