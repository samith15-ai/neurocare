import { describe, it, expect } from 'vitest';
import { extractFacialFeatures, extractMotorFeatures, extractVocalFeatures } from './extractors';

describe('Multimodal Feature Extractors', () => {
  it('extractFacialFeatures returns nominal values when landmarks are insufficient', () => {
    const res = extractFacialFeatures(null);
    expect(res.nasolabial_asymmetry_mm).toBeDefined();
    expect(res.facial_asymmetry_ratio).toBeLessThan(0.45); // FAST threshold
  });

  it('extractFacialFeatures correctly detects asymmetric face landmarks', () => {
    // Generate mock face landmarks with deliberate left-mouth elongation
    const mockLandmarks = Array.from({ length: 300 }, () => ({ x: 0.5, y: 0.5 }));
    mockLandmarks[1] = { x: 0.5, y: 0.5 }; // nose
    mockLandmarks[61] = { x: 0.2, y: 0.7 }; // left mouth (further away)
    mockLandmarks[291] = { x: 0.55, y: 0.65 }; // right mouth (closer)

    const res = extractFacialFeatures(mockLandmarks);
    expect(res.nasolabial_asymmetry_mm).toBeGreaterThan(0);
    expect(res.facial_asymmetry_ratio).toBeGreaterThan(0.2);
  });

  it('extractMotorFeatures calculates tap decay and tremor frequency', () => {
    const tapIntervals = [120, 125, 140, 160, 175];
    const wristPositions = Array.from({ length: 60 }, (_, i) => ({
      x: 0.5,
      y: 0.5 + Math.sin(i * 0.5) * 0.1,
      t: i * 16.6,
    }));

    const res = extractMotorFeatures(tapIntervals, wristPositions);
    expect(res.finger_tap_amplitude_decay).toBeGreaterThan(0);
    expect(res.resting_tremor_hz).toBeGreaterThan(0);
    expect(res.arm_pronator_drift_deg).toBeLessThan(18.0); // Within nominal FAST limit
  });

  it('extractVocalFeatures computes jitter and speech indices from audio buffer', () => {
    const buffer = new Float32Array(4096);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.sin(i * 0.05) * 0.5;
    }
    const res = extractVocalFeatures(buffer, 44100);
    expect(res.vocal_jitter_percent).toBeGreaterThan(0);
    expect(res.harmonics_to_noise_ratio_db).toBeGreaterThan(15);
  });
});
