// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  validateGaitQuality,
  extractGaitFeatures,
  simulateGaitAssessment,
  POSE_INDICES,
} from './gaitSignal';
import {
  validateBalanceQuality,
  extractBalanceFeatures,
  simulateBalanceAssessment,
} from './balanceSignal';
import {
  probeDeviceMetadata,
  validateCognitiveQuality,
  extractCognitiveFeatures,
  simulateCognitiveAssessment,
} from './cognitiveSignal';

describe('Phase 4 — Gait Assessment Signal Processing', () => {
  it('validates quality gate for full-body visibility vs partial framing', () => {
    const validFrames = simulateGaitAssessment(false);
    const validQuality = validateGaitQuality(validFrames);
    expect(validQuality.quality).toBe('valid');
    expect(validQuality.fullBodyVisible).toBe(true);
    expect(validQuality.stepCount).toBeGreaterThanOrEqual(4);

    // Occluded ankles (partial body)
    const occludedFrames = validFrames.map((f) => ({
      ...f,
      landmarks: f.landmarks.map((lm, idx) =>
        idx === POSE_INDICES.LEFT_ANKLE || idx === POSE_INDICES.RIGHT_ANKLE
          ? { ...lm, visibility: 0.1 }
          : lm
      ),
    }));

    const occludedQuality = validateGaitQuality(occludedFrames);
    expect(occludedQuality.quality).toBe('insufficient');
    expect(occludedQuality.reasons.some((r) => r.includes('outside the camera frame'))).toBe(true);
  });

  it('extracts cadence, step symmetry, arm swing asymmetry, and trunk lean', () => {
    const frames = simulateGaitAssessment(false);
    const features = extractGaitFeatures(frames);

    expect(features.cadenceStepsPerMin).toBeGreaterThan(60);
    expect(features.cadenceStepsPerMin).toBeLessThan(160);
    expect(features.stepSymmetryRatio).toBeGreaterThan(0.70);
    expect(features.armSwingAsymmetry).toBeGreaterThanOrEqual(0.0);
    expect(features.trunkLeanDeg).toBeGreaterThan(0.0);
    expect(features.turningDurationSec).toBeGreaterThan(0.5);
  });

  it('detects asymmetric arm swing and slowness in simulated abnormal gait', () => {
    const abnormalFrames = simulateGaitAssessment(true);
    const normalFrames = simulateGaitAssessment(false);

    const abnormalFeats = extractGaitFeatures(abnormalFrames);
    const normalFeats = extractGaitFeatures(normalFrames);

    // Abnormal simulation has lower cadence and higher arm asymmetry
    expect(abnormalFeats.cadenceStepsPerMin).toBeLessThan(normalFeats.cadenceStepsPerMin);
    expect(abnormalFeats.armSwingAsymmetry).toBeGreaterThan(normalFeats.armSwingAsymmetry);
  });
});

describe('Phase 4 — Postural Balance & Stability Posturography', () => {
  it('validates balance quality gate and rejects brief or out-of-frame recordings', () => {
    const validFrames = simulateBalanceAssessment(false);
    const quality = validateBalanceQuality(validFrames);
    expect(quality.quality).toBe('valid');
    expect(quality.torsoTrackedRatio).toBeGreaterThan(0.8);

    const briefQuality = validateBalanceQuality(validFrames.slice(0, 10));
    expect(briefQuality.quality).toBe('insufficient');
  });

  it('extracts sway path, 95% ellipse area, velocity, and trunk stability', () => {
    const frames = simulateBalanceAssessment(false);
    const features = extractBalanceFeatures(frames, 'feet_together');

    expect(features.swayPathNorm).toBeGreaterThan(0.01);
    expect(features.swayAreaNorm).toBeGreaterThan(0.0001);
    expect(features.meanVelocityNorm).toBeGreaterThan(0.001);
    expect(features.trunkStabilityDeg).toBeGreaterThan(0.1);
    expect(features.durationSec).toBeCloseTo(15, 0);
  });

  it('measures elevated sway path and area in abnormal stability simulation', () => {
    const normalFrames = simulateBalanceAssessment(false);
    const abnormalFrames = simulateBalanceAssessment(true);

    const normal = extractBalanceFeatures(normalFrames);
    const abnormal = extractBalanceFeatures(abnormalFrames);

    expect(abnormal.swayPathNorm).toBeGreaterThan(normal.swayPathNorm);
    expect(abnormal.swayAreaNorm).toBeGreaterThan(normal.swayAreaNorm);
  });
});

describe('Phase 4 — Cognitive Battery (SRT, Go/No-Go, Sequence Span)', () => {
  it('probes device metadata including input latency estimate', () => {
    const device = probeDeviceMetadata();
    expect(device.deviceType).toBeDefined();
    expect(device.userAgent).toBeDefined();
    expect(device.estimatedInputLatencyMs).toBeGreaterThan(5);
  });

  it('validates cognitive battery quality and flags extreme omission / anticipation', () => {
    const goodData = simulateCognitiveAssessment(false);
    const goodQuality = validateCognitiveQuality(goodData);
    expect(goodQuality.quality).toBe('valid');

    // Disengaged user with 0 Go responses
    const disengagedData = {
      ...goodData,
      gonogoTrials: goodData.gonogoTrials.map((t) => ({ ...t, correct: false, responseTimestamp: undefined })),
    };
    const disengagedQuality = validateCognitiveQuality(disengagedData);
    expect(disengagedQuality.reasons.some((r) => r.includes('High omission rate'))).toBe(true);
  });

  it('extracts median reaction time, Go/No-Go accuracy, and sequence span', () => {
    const data = simulateCognitiveAssessment(false);
    const features = extractCognitiveFeatures(data);

    expect(features.simpleReactionTimeMedianMs).toBeGreaterThan(150);
    expect(features.simpleReactionTimeMedianMs).toBeLessThan(600);
    expect(features.rtVariabilityMs).toBeGreaterThan(5);
    expect(features.gonogoAccuracyPercent).toBeGreaterThan(80);
    expect(features.sequenceSpanLength).toBeGreaterThanOrEqual(3);
    expect(features.totalCompletionTimeSec).toBeGreaterThan(0);
  });

  it('differentiates psychomotor slowness and commission errors in abnormal test-retest', () => {
    const normalData = simulateCognitiveAssessment(false);
    const slowData = simulateCognitiveAssessment(true);

    const normal = extractCognitiveFeatures(normalData);
    const slow = extractCognitiveFeatures(slowData);

    expect(slow.simpleReactionTimeMedianMs).toBeGreaterThan(normal.simpleReactionTimeMedianMs);
  });
});
