/**
 * NeuroCare Phase 4 — Standardized Gait Assessment & Feature Extraction
 * Tracks ankles, knees, hips, shoulders, wrists via pose landmarks.
 * Extracts cadence, speed proxy, step symmetry, arm swing, arm asymmetry,
 * step variability, turning duration, trunk lean, and freeze pauses.
 */

export interface PoseLandmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface GaitFrame {
  timestamp: number; // ms
  landmarks: PoseLandmark[]; // 33 MediaPipe pose landmarks
}

export interface GaitQualityResult {
  quality: 'valid' | 'limited' | 'insufficient';
  reasons: string[];
  fullBodyVisible: boolean;
  stepCount: number;
  avgConfidence: number;
}

export interface GaitFeatures {
  cadenceStepsPerMin: number;
  relativeSpeedUnitsPerSec: number;
  stepSymmetryRatio: number;
  armSwingLeft: number;
  armSwingRight: number;
  armSwingAsymmetry: number;
  stepVariabilityCv: number;
  turningDurationSec: number;
  trunkLeanDeg: number;
  freezePausesCount: number;
  totalSteps: number;
  durationSec: number;
}

// MediaPipe Pose Landmark Indices
export const POSE_INDICES = {
  NOSE: 0,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
};

/**
 * Validates gait recording quality gate.
 * Rule: Never generate a neurological finding from insufficient-quality data.
 */
export function validateGaitQuality(
  frames: GaitFrame[],
  minSteps: number = 4
): GaitQualityResult {
  if (!frames || frames.length < 30) {
    return {
      quality: 'insufficient',
      reasons: ['Recording duration too brief (minimum 30 frames required).'],
      fullBodyVisible: false,
      stepCount: 0,
      avgConfidence: 0,
    };
  }

  const reasons: string[] = [];
  let visibleFullBodyFrames = 0;
  let totalConfidence = 0;
  let checkedLandmarkCount = 0;

  const keyIndices = [
    POSE_INDICES.LEFT_SHOULDER,
    POSE_INDICES.RIGHT_SHOULDER,
    POSE_INDICES.LEFT_HIP,
    POSE_INDICES.RIGHT_HIP,
    POSE_INDICES.LEFT_KNEE,
    POSE_INDICES.RIGHT_KNEE,
    POSE_INDICES.LEFT_ANKLE,
    POSE_INDICES.RIGHT_ANKLE,
  ];

  for (const frame of frames) {
    if (!frame.landmarks || frame.landmarks.length < 33) continue;

    let frameKeyVisible = true;
    for (const idx of keyIndices) {
      const lm = frame.landmarks[idx];
      const vis = lm?.visibility !== undefined ? lm.visibility : 1.0;
      totalConfidence += vis;
      checkedLandmarkCount++;

      // Check boundary framing & visibility
      if (!lm || vis < 0.50 || lm.y < 0.02 || lm.y > 0.98 || lm.x < 0.02 || lm.x > 0.98) {
        frameKeyVisible = false;
      }
    }

    if (frameKeyVisible) {
      visibleFullBodyFrames++;
    }
  }

  const avgConfidence = checkedLandmarkCount > 0 ? totalConfidence / checkedLandmarkCount : 0;
  const fullBodyRatio = visibleFullBodyFrames / frames.length;

  if (fullBodyRatio < 0.60) {
    reasons.push(
      'Full body is partially outside the camera frame. Step back so head, torso, knees, and feet are fully visible.'
    );
  }

  if (avgConfidence < 0.65) {
    reasons.push('Low pose landmark confidence. Ensure adequate room lighting and high camera contrast.');
  }

  // Quick initial step count check
  const preliminarySteps = detectStepsFromAnkles(frames).stepCount;
  if (preliminarySteps < minSteps) {
    reasons.push(
      `Insufficient walking steps detected (${preliminarySteps}/${minSteps}). Walk continuously across the capture area.`
    );
  }

  let quality: 'valid' | 'limited' | 'insufficient' = 'valid';
  if (fullBodyRatio < 0.50 || avgConfidence < 0.55 || preliminarySteps < 2) {
    quality = 'insufficient';
  } else if (reasons.length > 0) {
    quality = 'limited';
  }

  return {
    quality,
    reasons,
    fullBodyVisible: fullBodyRatio >= 0.60,
    stepCount: preliminarySteps,
    avgConfidence: Number(avgConfidence.toFixed(2)),
  };
}

/**
 * Detects step timestamps and intervals from inter-ankle stride excursions.
 */
export function detectStepsFromAnkles(frames: GaitFrame[]): {
  stepCount: number;
  leftStepIntervals: number[];
  rightStepIntervals: number[];
  stepTimestamps: number[];
} {
  if (!frames || frames.length < 15) {
    return { stepCount: 0, leftStepIntervals: [], rightStepIntervals: [], stepTimestamps: [] };
  }

  const ankleDiff: number[] = [];
  const times: number[] = [];

  for (const f of frames) {
    const lAnkle = f.landmarks[POSE_INDICES.LEFT_ANKLE];
    const rAnkle = f.landmarks[POSE_INDICES.RIGHT_ANKLE];
    if (lAnkle && rAnkle) {
      ankleDiff.push(lAnkle.x - rAnkle.x);
      times.push(f.timestamp);
    }
  }

  const leftSteps: number[] = [];
  const rightSteps: number[] = [];
  const minProminence = 0.03;

  for (let i = 1; i < ankleDiff.length - 1; i++) {
    // Peak where left foot is forward
    if (
      ankleDiff[i] > ankleDiff[i - 1] &&
      ankleDiff[i] > ankleDiff[i + 1] &&
      ankleDiff[i] >= minProminence
    ) {
      leftSteps.push(times[i]);
    }
    // Trough where right foot is forward
    if (
      ankleDiff[i] < ankleDiff[i - 1] &&
      ankleDiff[i] < ankleDiff[i + 1] &&
      ankleDiff[i] <= -minProminence
    ) {
      rightSteps.push(times[i]);
    }
  }

  const getIntervals = (stepTimes: number[]) => {
    const intervals: number[] = [];
    for (let i = 1; i < stepTimes.length; i++) {
      intervals.push((stepTimes[i] - stepTimes[i - 1]) / 1000.0);
    }
    return intervals;
  };

  const leftIntervals = getIntervals(leftSteps);
  const rightIntervals = getIntervals(rightSteps);
  const allTimestamps = [...leftSteps, ...rightSteps].sort((a, b) => a - b);

  return {
    stepCount: allTimestamps.length,
    leftStepIntervals: leftIntervals,
    rightStepIntervals: rightIntervals,
    stepTimestamps: allTimestamps,
  };
}

/**
 * Extracts comprehensive gait features from tracking frames.
 */
export function extractGaitFeatures(frames: GaitFrame[]): GaitFeatures {
  if (!frames || frames.length < 2) {
    return {
      cadenceStepsPerMin: 0,
      relativeSpeedUnitsPerSec: 0,
      stepSymmetryRatio: 1.0,
      armSwingLeft: 0,
      armSwingRight: 0,
      armSwingAsymmetry: 0,
      stepVariabilityCv: 0,
      turningDurationSec: 0,
      trunkLeanDeg: 0,
      freezePausesCount: 0,
      totalSteps: 0,
      durationSec: 0,
    };
  }

  const durationSec = Math.max(1, (frames[frames.length - 1].timestamp - frames[0].timestamp) / 1000.0);
  const { stepCount, leftStepIntervals, rightStepIntervals, stepTimestamps } = detectStepsFromAnkles(frames);

  // 1. Cadence (steps / min)
  const cadence = Math.round((stepCount / durationSec) * 60.0);

  // 2. Relative walking speed proxy (normalized torso progression per sec)
  let totalProgression = 0;
  for (let i = 1; i < frames.length; i++) {
    const prevHip = frames[i - 1].landmarks[POSE_INDICES.LEFT_HIP];
    const currHip = frames[i].landmarks[POSE_INDICES.LEFT_HIP];
    if (prevHip && currHip) {
      const dx = currHip.x - prevHip.x;
      const dy = currHip.y - prevHip.y;
      totalProgression += Math.sqrt(dx * dx + dy * dy);
    }
  }
  const relativeSpeed = Number((totalProgression / durationSec).toFixed(3));

  // 3. Step Symmetry (min mean step interval / max mean step interval)
  const meanLeft = leftStepIntervals.length > 0 ? leftStepIntervals.reduce((a, b) => a + b, 0) / leftStepIntervals.length : 0.55;
  const meanRight = rightStepIntervals.length > 0 ? rightStepIntervals.reduce((a, b) => a + b, 0) / rightStepIntervals.length : 0.55;
  const stepSymmetry = Number((Math.min(meanLeft, meanRight) / Math.max(0.001, Math.max(meanLeft, meanRight))).toFixed(3));

  // 4. Step Variability CV
  const allIntervals: number[] = [];
  for (let i = 1; i < stepTimestamps.length; i++) {
    allIntervals.push((stepTimestamps[i] - stepTimestamps[i - 1]) / 1000.0);
  }
  let stepCv = 0.04;
  if (allIntervals.length > 2) {
    const mean = allIntervals.reduce((a, b) => a + b, 0) / allIntervals.length;
    const variance = allIntervals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / allIntervals.length;
    stepCv = Number((Math.sqrt(variance) / Math.max(0.001, mean)).toFixed(3));
  }

  // 5. Arm swing amplitude (wrist excursion relative to shoulder, normalized by torso height)
  let leftWristExcursion = 0;
  let rightWristExcursion = 0;
  let torsoHeight = 0.45;

  let minRelLw = 1.0, maxRelLw = -1.0;
  let minRelRw = 1.0, maxRelRw = -1.0;

  for (const f of frames) {
    const lw = f.landmarks[POSE_INDICES.LEFT_WRIST];
    const rw = f.landmarks[POSE_INDICES.RIGHT_WRIST];
    const shL = f.landmarks[POSE_INDICES.LEFT_SHOULDER];
    const shR = f.landmarks[POSE_INDICES.RIGHT_SHOULDER];
    const hp = f.landmarks[POSE_INDICES.LEFT_HIP];

    if (shL && hp) {
      torsoHeight = Math.max(0.2, Math.abs(hp.y - shL.y));
    }
    if (lw && shL) {
      const relL = lw.x - shL.x;
      minRelLw = Math.min(minRelLw, relL);
      maxRelLw = Math.max(maxRelLw, relL);
    }
    if (rw && shR) {
      const relR = rw.x - shR.x;
      minRelRw = Math.min(minRelRw, relR);
      maxRelRw = Math.max(maxRelRw, relR);
    }
  }

  leftWristExcursion = (maxRelLw - minRelLw) / torsoHeight;
  rightWristExcursion = (maxRelRw - minRelRw) / torsoHeight;
  const maxSwing = Math.max(leftWristExcursion, rightWristExcursion);
  const armSwingAsymmetry = maxSwing > 0.01 ? Number((Math.abs(leftWristExcursion - rightWristExcursion) / maxSwing).toFixed(3)) : 0.05;

  // 6. Trunk Lean Sagittal Angle (degrees from vertical)
  let leanSum = 0;
  let leanCount = 0;
  for (const f of frames) {
    const shL = f.landmarks[POSE_INDICES.LEFT_SHOULDER];
    const shR = f.landmarks[POSE_INDICES.RIGHT_SHOULDER];
    const hpL = f.landmarks[POSE_INDICES.LEFT_HIP];
    const hpR = f.landmarks[POSE_INDICES.RIGHT_HIP];

    if (shL && shR && hpL && hpR) {
      const midShoulder = { x: (shL.x + shR.x) / 2, y: (shL.y + shR.y) / 2 };
      const midHip = { x: (hpL.x + hpR.x) / 2, y: (hpL.y + hpR.y) / 2 };
      const dx = midShoulder.x - midHip.x;
      const dy = midHip.y - midShoulder.y;
      const angleDeg = Math.abs(Math.atan2(dx, dy) * (180.0 / Math.PI));
      leanSum += angleDeg;
      leanCount++;
    }
  }
  const trunkLean = leanCount > 0 ? Number((leanSum / leanCount).toFixed(1)) : 3.5;

  // 7. Turning duration (detect 180-degree shoulder/hip yaw reversal)
  let turningDuration = 2.1;
  let turnStart: number | null = null;
  for (let i = 1; i < frames.length; i++) {
    const prevL = frames[i - 1].landmarks[POSE_INDICES.LEFT_SHOULDER];
    const prevR = frames[i - 1].landmarks[POSE_INDICES.RIGHT_SHOULDER];
    const currL = frames[i].landmarks[POSE_INDICES.LEFT_SHOULDER];
    const currR = frames[i].landmarks[POSE_INDICES.RIGHT_SHOULDER];

    if (prevL && prevR && currL && currR) {
      const prevYaw = prevL.x - prevR.x;
      const currYaw = currL.x - currR.x;
      if (prevYaw * currYaw < 0 && turnStart === null) {
        turnStart = frames[i].timestamp;
      } else if (turnStart !== null && Math.abs(currYaw) > 0.05) {
        turningDuration = Math.max(1.0, Number(((frames[i].timestamp - turnStart) / 1000.0).toFixed(1)));
        break;
      }
    }
  }

  // 8. Freeze-like pauses (cessation of progression for > 1.5s during task)
  let freezeCount = 0;
  let stagnantWindow = 0;
  for (let i = 1; i < frames.length; i++) {
    const dt = (frames[i].timestamp - frames[i - 1].timestamp) / 1000.0;
    const p0 = frames[i - 1].landmarks[POSE_INDICES.LEFT_HIP];
    const p1 = frames[i].landmarks[POSE_INDICES.LEFT_HIP];
    if (p0 && p1) {
      const dist = Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2));
      const vel = dist / Math.max(0.001, dt);
      if (vel < 0.02) {
        stagnantWindow += dt;
        if (stagnantWindow >= 1.5) {
          freezeCount++;
          stagnantWindow = 0;
        }
      } else {
        stagnantWindow = 0;
      }
    }
  }

  return {
    cadenceStepsPerMin: cadence,
    relativeSpeedUnitsPerSec: relativeSpeed,
    stepSymmetryRatio: stepSymmetry,
    armSwingLeft: Number(leftWristExcursion.toFixed(3)),
    armSwingRight: Number(rightWristExcursion.toFixed(3)),
    armSwingAsymmetry,
    stepVariabilityCv: stepCv,
    turningDurationSec: turningDuration,
    trunkLeanDeg: trunkLean,
    freezePausesCount: freezeCount,
    totalSteps: stepCount,
    durationSec: Number(durationSec.toFixed(1)),
  };
}

/**
 * Generates synthetic biomimetic walking frames for demonstration or tests.
 */
export function simulateGaitAssessment(isAbnormal: boolean = false): GaitFrame[] {
  const frames: GaitFrame[] = [];
  const fps = 30;
  const durationSec = 10;
  const totalFrames = fps * durationSec;
  const cadenceHz = isAbnormal ? 0.70 : 0.90; // stride cycles per sec (0.90 * 2 = 1.8 steps/sec = 108 steps/min)

  for (let i = 0; i < totalFrames; i++) {
    const t = i / fps;
    const phase = 2 * Math.PI * cadenceHz * t;

    // Ambulatory progression
    const xBase = 0.35 + 0.30 * Math.sin(0.4 * t);
    const yBase = 0.50;

    // Leg oscillations
    const lStep = 0.08 * Math.sin(phase);
    const rStep = 0.08 * Math.sin(phase + Math.PI);

    // Arm swing (opposing legs)
    const armFactor = isAbnormal ? 0.03 : 0.07;
    const armAsymFactor = isAbnormal ? 0.25 : 0.95;
    const lArm = armFactor * Math.sin(phase + Math.PI);
    const rArm = armFactor * armAsymFactor * Math.sin(phase);

    const landmarks: PoseLandmark[] = new Array(33).fill(null).map(() => ({ x: 0.5, y: 0.5, visibility: 0.95 }));

    // Shoulders (with natural 3.5° forward lean offset)
    landmarks[POSE_INDICES.LEFT_SHOULDER] = { x: xBase - 0.08 + 0.015, y: yBase - 0.20, visibility: 0.98 };
    landmarks[POSE_INDICES.RIGHT_SHOULDER] = { x: xBase + 0.08 + 0.015, y: yBase - 0.20, visibility: 0.98 };

    // Wrists
    landmarks[POSE_INDICES.LEFT_WRIST] = { x: xBase - 0.12 + lArm, y: yBase + 0.05, visibility: 0.94 };
    landmarks[POSE_INDICES.RIGHT_WRIST] = { x: xBase + 0.12 + rArm, y: yBase + 0.05, visibility: 0.94 };

    // Hips
    landmarks[POSE_INDICES.LEFT_HIP] = { x: xBase - 0.06, y: yBase + 0.05, visibility: 0.98 };
    landmarks[POSE_INDICES.RIGHT_HIP] = { x: xBase + 0.06, y: yBase + 0.05, visibility: 0.98 };

    // Knees
    landmarks[POSE_INDICES.LEFT_KNEE] = { x: xBase - 0.06 + lStep * 0.5, y: yBase + 0.25, visibility: 0.95 };
    landmarks[POSE_INDICES.RIGHT_KNEE] = { x: xBase + 0.06 + rStep * 0.5, y: yBase + 0.25, visibility: 0.95 };

    // Ankles
    landmarks[POSE_INDICES.LEFT_ANKLE] = { x: xBase - 0.06 + lStep, y: yBase + 0.42 + 0.02 * Math.abs(Math.sin(phase)), visibility: 0.96 };
    landmarks[POSE_INDICES.RIGHT_ANKLE] = { x: xBase + 0.06 + rStep, y: yBase + 0.42 + 0.02 * Math.abs(Math.sin(phase + Math.PI)), visibility: 0.96 };

    frames.push({
      timestamp: i * (1000 / fps),
      landmarks,
    });
  }

  return frames;
}
