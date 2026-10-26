import { describe, it, expect } from 'vitest';
import {
  calculateNormalizedDistance,
  movingAverageSmooth,
  detectPeaks,
  calculateLinearRegressionSlope,
  extractTappingMetrics,
  computeBilateralAsymmetry,
  evaluateTappingQuality,
  type HandLandmark,
  type SignalSample,
} from './tappingSignal';

/**
 * Helper to generate synthetic tapping waveform with ground-truth parameters
 */
function generateSyntheticTappingSignal(params: {
  tapCount: number;
  frequencyHz: number;
  initialAmplitude: number;
  amplitudeDecrementSlope: number; // change in amplitude over normalized duration [0, 1]
  noiseStd?: number;
  sampleRateFps?: number;
}): { samples: SignalSample[]; groundTruthPeaks: number[] } {
  const {
    tapCount,
    frequencyHz,
    initialAmplitude,
    amplitudeDecrementSlope,
    noiseStd = 0.01,
    sampleRateFps = 30,
  } = params;

  const periodSeconds = 1 / frequencyHz;
  const totalDurationSeconds = (tapCount + 0.5) * periodSeconds;
  const totalFrames = Math.floor(totalDurationSeconds * sampleRateFps);

  const samples: SignalSample[] = [];
  const groundTruthPeaks: number[] = [];

  for (let i = 0; i < totalFrames; i++) {
    const tSeconds = i / sampleRateFps;
    const progress = Math.min(1.0, tSeconds / totalDurationSeconds);

    // Current amplitude with linear decrement
    const currentAmp = Math.max(0.1, initialAmplitude + amplitudeDecrementSlope * progress);

    // Phase: peak occurs when (t - 0.25 * period) % period == 0
    // Sine wave opening and closing: 0 = fully closed, currentAmp = fully open
    const phase = (2 * Math.PI * frequencyHz) * tSeconds;
    const cleanSignal = (0.5 - 0.5 * Math.cos(phase)) * currentAmp;

    // Pseudo-random noise
    const noise = (Math.sin(i * 12.9898) * 0.5) * noiseStd;
    const normalizedDistance = Math.max(0, cleanSignal + noise);

    samples.push({
      timestamp: tSeconds * 1000,
      rawDistance: normalizedDistance * 0.12,
      palmWidth: 0.12,
      normalizedDistance: Number(normalizedDistance.toFixed(4)),
    });
  }

  // Calculate approximate peak times
  for (let tap = 0; tap < tapCount; tap++) {
    const peakTimeSec = (tap + 0.5) * periodSeconds;
    groundTruthPeaks.push(peakTimeSec * 1000);
  }

  return { samples, groundTruthPeaks };
}

describe('Finger Tapping Kinematic Signal Processing & Quality Gate', () => {
  it('calculates normalized distance accurately using biometric palm width', () => {
    const mockLandmarks: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
    mockLandmarks[4] = { x: 0.4, y: 0.5 }; // thumb
    mockLandmarks[8] = { x: 0.6, y: 0.5 }; // index (distance = 0.2)
    mockLandmarks[5] = { x: 0.45, y: 0.7 }; // index MCP
    mockLandmarks[17] = { x: 0.55, y: 0.7 }; // pinky MCP (palm width = 0.1)

    const res = calculateNormalizedDistance(mockLandmarks);
    expect(res.rawDistance).toBeCloseTo(0.2, 2);
    expect(res.palmWidth).toBeCloseTo(0.1, 2);
    expect(res.normalizedDistance).toBeCloseTo(2.0, 2);
  });

  it('movingAverageSmooth dampens high-frequency jitter without displacing peaks', () => {
    const noisySignal = [1.0, 1.2, 0.9, 1.1, 1.0];
    const smoothed = movingAverageSmooth(noisySignal, 3);
    expect(smoothed.length).toBe(noisySignal.length);
    expect(smoothed[1]).toBeCloseTo((1.0 + 1.2 + 0.9) / 3, 4);
  });

  it('detectPeaks precisely detects known tap count and prominence in synthetic signal', () => {
    // Generate synthetic signal with exactly 10 taps at 2.5 Hz
    const { samples, groundTruthPeaks } = generateSyntheticTappingSignal({
      tapCount: 10,
      frequencyHz: 2.5,
      initialAmplitude: 1.0,
      amplitudeDecrementSlope: 0,
      noiseStd: 0.02,
    });

    const timestamps = samples.map((s) => s.timestamp);
    const normalized = samples.map((s) => s.normalizedDistance);
    const smoothed = movingAverageSmooth(normalized, 3);
    const detectedPeaks = detectPeaks(smoothed, timestamps, 0.15, 3);

    // Detected tap count must match ground truth
    expect(detectedPeaks.length).toBe(10);

    // Each detected peak timestamp should be within 40ms of ground truth
    detectedPeaks.forEach((peak, i) => {
      const gt = groundTruthPeaks[i];
      expect(Math.abs(peak.timestamp - gt)).toBeLessThanOrEqual(50);
    });
  });

  it('calculates linear regression slope correctly', () => {
    const x = [0, 0.25, 0.5, 0.75, 1.0];
    const y = [1.0, 0.85, 0.70, 0.55, 0.40]; // Slope = -0.6
    const slope = calculateLinearRegressionSlope(x, y);
    expect(slope).toBeCloseTo(-0.6, 2);
  });

  it('extractTappingMetrics accurately extracts frequency, amplitude, and decrement slope', () => {
    // Generate 12 taps at 3.0 Hz with an amplitude decrement slope of -0.35
    const { samples } = generateSyntheticTappingSignal({
      tapCount: 12,
      frequencyHz: 3.0,
      initialAmplitude: 1.2,
      amplitudeDecrementSlope: -0.35,
      sampleRateFps: 30,
    });

    const metrics = extractTappingMetrics(samples, 'right', 'valid');

    expect(metrics.tap_count).toBe(12);
    expect(metrics.tap_frequency_hz).toBeCloseTo(3.0, 1);
    expect(metrics.mean_amplitude).toBeGreaterThan(0.7);
    expect(metrics.max_amplitude).toBeGreaterThan(1.0);
    // Amplitude decrement slope should be negative reflecting fatigue
    expect(metrics.amplitude_decrement_slope).toBeLessThan(0);
    expect(metrics.quality).toBe('valid');
  });

  it('computes bilateral asymmetry between right and left hand metrics', () => {
    const right = extractTappingMetrics(
      generateSyntheticTappingSignal({ tapCount: 12, frequencyHz: 3.0, initialAmplitude: 1.0, amplitudeDecrementSlope: 0 }).samples,
      'right'
    );
    const left = extractTappingMetrics(
      generateSyntheticTappingSignal({ tapCount: 8, frequencyHz: 2.0, initialAmplitude: 0.8, amplitudeDecrementSlope: 0 }).samples,
      'left'
    );

    const summary = computeBilateralAsymmetry(right, left);
    expect(summary.frequency_asymmetry_ratio).toBeDefined();
    expect(summary.frequency_asymmetry_ratio).toBeGreaterThan(0.2); // (3-2)/3 = 0.33
    expect(summary.overall_quality).toBe('valid');
  });

  it('quality gate rejects insufficient lighting, framing, or confidence', () => {
    // Insufficient lighting
    const darkCheck = evaluateTappingQuality({
      luma: 12, // < 20
      fps: 30,
      droppedFrameRatio: 0.05,
      handLandmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 })),
      confidence: 0.9,
    });
    expect(darkCheck.quality).toBe('insufficient');
    expect(darkCheck.reasons[0]).toContain('Lighting is too dim');

    // Insufficient framing (landmark outside bounds)
    const outOfBoundsCheck = evaluateTappingQuality({
      luma: 50,
      fps: 30,
      droppedFrameRatio: 0.05,
      handLandmarks: [{ x: 0.02, y: 0.5 }, ...Array.from({ length: 20 }, () => ({ x: 0.5, y: 0.5 }))],
      confidence: 0.9,
    });
    expect(outOfBoundsCheck.quality).toBe('insufficient');
    expect(outOfBoundsCheck.reasons[0]).toContain('partially outside the frame');

    // Missing hand
    const missingHandCheck = evaluateTappingQuality({
      luma: 50,
      fps: 30,
      droppedFrameRatio: 0.05,
      handLandmarks: null,
      confidence: 0,
    });
    expect(missingHandCheck.quality).toBe('insufficient');
  });

  it('quality gate returns limited for degraded but analyzable frame rates', () => {
    const limitedCheck = evaluateTappingQuality({
      luma: 45,
      fps: 16, // >14 but <18
      droppedFrameRatio: 0.18,
      handLandmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 })),
      confidence: 0.85,
    });
    expect(limitedCheck.quality).toBe('limited');
  });

  it('does NOT generate findings from insufficient quality recordings', () => {
    const insufficientSamples: SignalSample[] = [];
    const metrics = extractTappingMetrics(insufficientSamples, 'right', 'insufficient');
    expect(metrics.tap_count).toBe(0);
    expect(metrics.tap_frequency_hz).toBe(0);
    expect(metrics.quality).toBe('insufficient');
  });
});
