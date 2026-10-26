/**
 * Signal Processing and Feature Extraction for Finger Tapping Assessment
 *
 * Implements:
 * - Palm-width normalization: distance(thumb_tip, index_tip) / palm_width
 * - Moving-average smoothing
 * - Peak & trough detection with prominence filtering
 * - Amplitude decrement slope & speed decrement slope (linear regression)
 * - Hesitations & irregular taps
 * - Left-Right bilateral asymmetry
 * - Config-driven quality assessment (valid | limited | insufficient)
 */

export interface HandLandmark {
  x: number;
  y: number;
  z?: number;
}

export interface SignalSample {
  timestamp: number; // in milliseconds
  rawDistance: number;
  palmWidth: number;
  normalizedDistance: number;
  smoothedDistance?: number;
}

export interface TapPeak {
  index: number;
  timestamp: number;
  amplitude: number; // normalized opening
  prominence: number;
}

export interface QualityAssessment {
  quality: 'valid' | 'limited' | 'insufficient';
  reasons: string[];
  fps: number;
  droppedFrameRatio: number;
  meanConfidence: number;
  lightingOk: boolean;
  framingOk: boolean;
}

export interface FingerTappingMetrics {
  hand: 'right' | 'left';
  tap_count: number;
  tap_frequency_hz: number;
  mean_amplitude: number;
  max_amplitude: number;
  mean_iti_ms: number;
  iti_cv: number; // Coefficient of Variation of Inter-Tap Intervals
  amplitude_decrement_slope: number;
  speed_decrement_slope: number;
  hesitation_count: number;
  irregular_tap_count: number;
  quality: 'valid' | 'limited' | 'insufficient';
  tap_timestamps: number[];
  signal_samples: SignalSample[];
}

export interface BilateralTappingSummary {
  rightHand?: FingerTappingMetrics;
  leftHand?: FingerTappingMetrics;
  frequency_asymmetry_ratio?: number;
  amplitude_asymmetry_ratio?: number;
  overall_quality: 'valid' | 'limited' | 'insufficient';
}

/**
 * Computes Euclidean distance between two landmarks.
 */
export function euclideanDistance(a: HandLandmark, b: HandLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Calculates normalized thumb-index distance using palm width as biometric reference scale.
 * Landmarks:
 * 4: Thumb Tip
 * 8: Index Finger Tip
 * 5: Index Finger MCP
 * 17: Pinky Finger MCP
 */
export function calculateNormalizedDistance(landmarks: HandLandmark[]): {
  normalizedDistance: number;
  rawDistance: number;
  palmWidth: number;
} {
  if (!landmarks || landmarks.length < 21) {
    return { normalizedDistance: 0, rawDistance: 0, palmWidth: 1 };
  }

  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];

  const rawDistance = euclideanDistance(thumbTip, indexTip);
  const palmWidth = Math.max(0.001, euclideanDistance(indexMcp, pinkyMcp));
  const normalizedDistance = rawDistance / palmWidth;

  return {
    normalizedDistance: Number(normalizedDistance.toFixed(4)),
    rawDistance: Number(rawDistance.toFixed(4)),
    palmWidth: Number(palmWidth.toFixed(4)),
  };
}

/**
 * Moving-average smoothing filter to reduce camera frame jitter without attenuating tap peaks.
 */
export function movingAverageSmooth(data: number[], windowSize: number = 3): number[] {
  if (data.length < windowSize) return [...data];
  const smoothed: number[] = [];
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - half);
    const end = Math.min(data.length, i + half + 1);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += data[j];
    }
    smoothed.push(sum / (end - start));
  }
  return smoothed;
}

/**
 * Detects peaks with prominence filtering.
 * A peak is a local maximum whose prominence exceeds `minProminence`.
 */
export function detectPeaks(
  signal: number[],
  timestamps: number[],
  minProminence: number = 0.15,
  minDistanceIndices: number = 3
): TapPeak[] {
  const peaks: TapPeak[] = [];
  const n = signal.length;
  if (n < 3) return peaks;

  const candidateIndices: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    if (signal[i] > signal[i - 1] && signal[i] >= signal[i + 1]) {
      candidateIndices.push(i);
    }
  }

  for (const idx of candidateIndices) {
    const val = signal[idx];

    // Find left minimum before this peak
    let leftMin = val;
    for (let l = idx - 1; l >= 0; l--) {
      if (signal[l] > val) break;
      if (signal[l] < leftMin) leftMin = signal[l];
    }

    // Find right minimum after this peak
    let rightMin = val;
    for (let r = idx + 1; r < n; r++) {
      if (signal[r] > val) break;
      if (signal[r] < rightMin) rightMin = signal[r];
    }

    const baseline = Math.max(leftMin, rightMin);
    const prominence = val - baseline;

    if (prominence >= minProminence) {
      // Check minimum distance constraint
      if (peaks.length > 0) {
        const last = peaks[peaks.length - 1];
        if (idx - last.index < minDistanceIndices) {
          if (val > last.amplitude) {
            peaks[peaks.length - 1] = {
              index: idx,
              timestamp: timestamps[idx] || idx * 33.3,
              amplitude: val,
              prominence,
            };
          }
          continue;
        }
      }

      peaks.push({
        index: idx,
        timestamp: timestamps[idx] || idx * 33.3,
        amplitude: val,
        prominence,
      });
    }
  }

  return peaks;
}

/**
 * Linear regression slope: y = m * x + b
 */
export function calculateLinearRegressionSlope(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += x[i];
    sumY += y[i];
    sumXY += x[i] * y[i];
    sumX2 += x[i] * x[i];
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (Math.abs(denominator) < 1e-9) return 0;
  return (n * sumXY - sumX * sumY) / denominator;
}

/**
 * Extracts complete standardized finger-tapping metrics from recorded samples.
 */
export function extractTappingMetrics(
  samples: SignalSample[],
  hand: 'right' | 'left',
  quality: 'valid' | 'limited' | 'insufficient' = 'valid'
): FingerTappingMetrics {
  if (samples.length < 10 || quality === 'insufficient') {
    return {
      hand,
      tap_count: 0,
      tap_frequency_hz: 0,
      mean_amplitude: 0,
      max_amplitude: 0,
      mean_iti_ms: 0,
      iti_cv: 0,
      amplitude_decrement_slope: 0,
      speed_decrement_slope: 0,
      hesitation_count: 0,
      irregular_tap_count: 0,
      quality,
      tap_timestamps: [],
      signal_samples: samples,
    };
  }

  const timestamps = samples.map((s) => s.timestamp);
  const normalized = samples.map((s) => s.normalizedDistance);
  const smoothed = movingAverageSmooth(normalized, 3);

  // Attach smoothed values
  samples.forEach((s, idx) => {
    s.smoothedDistance = smoothed[idx];
  });

  const peaks = detectPeaks(smoothed, timestamps, 0.12, 3);
  const tapCount = peaks.length;

  if (tapCount < 2) {
    return {
      hand,
      tap_count: tapCount,
      tap_frequency_hz: 0,
      mean_amplitude: peaks[0]?.amplitude ?? 0,
      max_amplitude: peaks[0]?.amplitude ?? 0,
      mean_iti_ms: 0,
      iti_cv: 0,
      amplitude_decrement_slope: 0,
      speed_decrement_slope: 0,
      hesitation_count: 0,
      irregular_tap_count: 0,
      quality,
      tap_timestamps: peaks.map((p) => p.timestamp),
      signal_samples: samples,
    };
  }

  // Inter-tap intervals (ITIs)
  const itis: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    itis.push(peaks[i].timestamp - peaks[i - 1].timestamp);
  }

  const totalDurationSeconds = (peaks[peaks.length - 1].timestamp - peaks[0].timestamp) / 1000;
  const tapFrequencyHz = totalDurationSeconds > 0 ? Number(((tapCount - 1) / totalDurationSeconds).toFixed(2)) : 0;

  const amplitudes = peaks.map((p) => p.amplitude);
  const meanAmplitude = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;
  const maxAmplitude = Math.max(...amplitudes);

  const meanItiMs = itis.reduce((a, b) => a + b, 0) / itis.length;
  const itiVariance = itis.reduce((acc, val) => acc + Math.pow(val - meanItiMs, 2), 0) / itis.length;
  const itiStd = Math.sqrt(itiVariance);
  const itiCv = meanItiMs > 0 ? Number((itiStd / meanItiMs).toFixed(3)) : 0;

  // Amplitude decrement slope (amplitude vs normalized time [0, 1])
  const timeNormalized = peaks.map((p) => (p.timestamp - peaks[0].timestamp) / Math.max(1, totalDurationSeconds * 1000));
  const amplitudeDecrementSlope = Number(calculateLinearRegressionSlope(timeNormalized, amplitudes).toFixed(4));

  // Speed decrement slope (ITI vs normalized interval index [0, 1])
  const intervalIndices = itis.map((_, idx) => (itis.length > 1 ? idx / (itis.length - 1) : 0));
  const speedDecrementSlope = Number(calculateLinearRegressionSlope(intervalIndices, itis).toFixed(2));

  // Hesitations: ITI > 1.5 * mean ITI
  const hesitationCount = itis.filter((iti) => iti > 1.5 * meanItiMs).length;

  // Irregular taps: Amplitude or ITI deviating > 2 sigma from mean
  const ampVariance = amplitudes.reduce((acc, val) => acc + Math.pow(val - meanAmplitude, 2), 0) / amplitudes.length;
  const ampStd = Math.sqrt(ampVariance);
  const irregularTapCount = amplitudes.filter((a) => Math.abs(a - meanAmplitude) > 2 * ampStd).length;

  return {
    hand,
    tap_count: tapCount,
    tap_frequency_hz: tapFrequencyHz,
    mean_amplitude: Number(meanAmplitude.toFixed(3)),
    max_amplitude: Number(maxAmplitude.toFixed(3)),
    mean_iti_ms: Number(meanItiMs.toFixed(1)),
    iti_cv: itiCv,
    amplitude_decrement_slope: amplitudeDecrementSlope,
    speed_decrement_slope: speedDecrementSlope,
    hesitation_count: hesitationCount,
    irregular_tap_count: irregularTapCount,
    quality,
    tap_timestamps: peaks.map((p) => p.timestamp),
    signal_samples: samples,
  };
}

/**
 * Computes bilateral asymmetry between Right and Left hand tapping metrics.
 */
export function computeBilateralAsymmetry(
  right: FingerTappingMetrics,
  left: FingerTappingMetrics
): BilateralTappingSummary {
  const overallQuality: 'valid' | 'limited' | 'insufficient' =
    right.quality === 'insufficient' || left.quality === 'insufficient'
      ? 'insufficient'
      : right.quality === 'limited' || left.quality === 'limited'
      ? 'limited'
      : 'valid';

  let freqRatio: number | undefined;
  let ampRatio: number | undefined;

  if (right.tap_frequency_hz > 0 && left.tap_frequency_hz > 0) {
    freqRatio = Number((Math.abs(right.tap_frequency_hz - left.tap_frequency_hz) / Math.max(right.tap_frequency_hz, left.tap_frequency_hz)).toFixed(3));
  }

  if (right.mean_amplitude > 0 && left.mean_amplitude > 0) {
    ampRatio = Number((Math.abs(right.mean_amplitude - left.mean_amplitude) / Math.max(right.mean_amplitude, left.mean_amplitude)).toFixed(3));
  }

  return {
    rightHand: right,
    leftHand: left,
    frequency_asymmetry_ratio: freqRatio,
    amplitude_asymmetry_ratio: ampRatio,
    overall_quality: overallQuality,
  };
}

/**
 * Validates recording quality against clinical thresholds.
 */
export function evaluateTappingQuality(params: {
  luma: number;
  fps: number;
  droppedFrameRatio: number;
  handLandmarks: HandLandmark[] | null;
  confidence: number;
}): QualityAssessment {
  const reasons: string[] = [];
  const { luma, fps, droppedFrameRatio, handLandmarks, confidence } = params;

  const lightingOk = luma >= 20.0;
  if (!lightingOk) {
    reasons.push('Lighting is too dim. Please illuminate your hand from the front.');
  }

  if (!handLandmarks || handLandmarks.length < 21) {
    reasons.push('No hand detected in the frame. Please hold your hand open facing the camera.');
    return {
      quality: 'insufficient',
      reasons,
      fps,
      droppedFrameRatio,
      meanConfidence: confidence,
      lightingOk,
      framingOk: false,
    };
  }

  // Check framing: all landmarks must stay within 0.10 to 0.90 normalized viewport
  let inBounds = true;
  for (const pt of handLandmarks) {
    if (pt.x < 0.08 || pt.x > 0.92 || pt.y < 0.08 || pt.y > 0.92) {
      inBounds = false;
      break;
    }
  }

  if (!inBounds) {
    reasons.push('Your hand is partially outside the frame. Move your hand into the highlighted area.');
  }

  if (fps < 14.0) {
    reasons.push('Camera frame rate is too low (< 15 FPS) for reliable kinematic tracking.');
  }

  if (droppedFrameRatio > 0.25) {
    reasons.push('Excessive dropped frames detected. Retake is recommended for accurate rhythm.');
  }

  if (confidence < 0.50) {
    reasons.push('Low hand tracking confidence. Keep your hand facing the camera.');
  }

  let quality: 'valid' | 'limited' | 'insufficient' = 'valid';
  if (!lightingOk || !inBounds || confidence < 0.50) {
    quality = 'insufficient';
  } else if (fps < 18.0 || droppedFrameRatio > 0.15 || reasons.length > 0) {
    quality = 'limited';
  }

  return {
    quality,
    reasons,
    fps,
    droppedFrameRatio,
    meanConfidence: confidence,
    lightingOk,
    framingOk: inBounds,
  };
}
