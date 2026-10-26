import { describe, it, expect } from 'vitest';
import {
  evaluateAudioQuality,
  extractSustainedVowelFeatures,
  extractDDKFeatures,
  extractReadingPassageFeatures,
  buildStandardSpeechOutput,
} from './speechSignal';
import {
  evaluateFacialQuality,
  estimateHeadPose,
  calculateEyeAspectRatio,
  extractFacialTaskMetrics,
  buildStandardFacialOutput,
  type FacialLandmark3D,
} from './facialSignal';

describe('Phase 2 — Speech & Facial Movement Signal Processing', () => {
  describe('Audio Quality & Speech Feature Extraction', () => {
    it('detects insufficient audio quality due to high clipping or low SNR', () => {
      const sampleRate = 44100;
      const clippedBuffer = new Float32Array(sampleRate * 4);
      // Simulate heavy clipping
      for (let i = 0; i < clippedBuffer.length; i++) {
        clippedBuffer[i] = (i % 10 < 3) ? 1.0 : 0.05;
      }

      const quality = evaluateAudioQuality(clippedBuffer, sampleRate, 5);
      expect(quality.clippingFraction).toBeGreaterThan(0.02);
      expect(quality.reasons.some((r) => r.includes('clipping'))).toBe(true);
    });

    it('validates clean sustained phonation and computes pitch & stability', () => {
      const sampleRate = 44100;
      const buffer = new Float32Array(sampleRate * 4);
      const f0 = 200.0; // 200 Hz pure tone with minor harmonics
      for (let i = 0; i < buffer.length; i++) {
        const t = i / sampleRate;
        buffer[i] = Math.sin(2 * Math.PI * f0 * t) * 0.4 + Math.sin(2 * Math.PI * 2 * f0 * t) * 0.1;
      }

      const quality = evaluateAudioQuality(buffer, sampleRate, 4);
      const { features, unavailable } = extractSustainedVowelFeatures(buffer, sampleRate, quality);

      expect(features.pitch_mean_hz).toBeCloseTo(200, -1);
      expect(features.voice_stability_index).toBeGreaterThan(0.8);
      // Jitter & shimmer should be available when SNR is acceptable
      if (quality.snrDb >= 14) {
        expect(features.jitter_percent).toBeDefined();
        expect(features.shimmer_percent).toBeDefined();
      } else {
        expect(unavailable).toContain('jitter_percent');
      }
    });

    it('extracts DDK syllable rate and regularity CV for pa-ta-ka bursts', () => {
      const sampleRate = 44100;
      const buffer = new Float32Array(sampleRate * 6);
      const syllablesPerSec = 5.0; // 5 Hz burst rate
      const intervalSamples = Math.floor(sampleRate / syllablesPerSec);

      for (let s = 0; s < 30; s++) {
        const start = s * intervalSamples;
        for (let j = 0; j < Math.min(1000, buffer.length - start); j++) {
          buffer[start + j] = Math.sin(j * 0.2) * 0.6;
        }
      }

      const { features, syllableTimestamps } = extractDDKFeatures(buffer, sampleRate);
      expect(syllableTimestamps.length).toBeGreaterThan(15);
      expect(features.repetition_rate_hz).toBeCloseTo(5.0, 0);
      expect(features.repetition_regularity_cv).toBeLessThan(0.35);
    });

    it('extracts reading passage speech rate and pauses', () => {
      const sampleRate = 44100;
      const buffer = new Float32Array(sampleRate * 8);
      // Continuous speech with one 400ms pause
      for (let i = 0; i < buffer.length; i++) {
        const t = i / sampleRate;
        if (t >= 3.0 && t <= 3.4) {
          buffer[i] = 0.001; // Silent pause
        } else {
          buffer[i] = Math.sin(i * 0.05) * 0.25;
        }
      }

      const { features } = extractReadingPassageFeatures(buffer, sampleRate, 'en');
      expect(features.pause_count).toBeGreaterThanOrEqual(1);
      expect(features.speech_rate_syllables_sec).toBeGreaterThan(0);
    });

    it('formats standard output schema for speech assessment', () => {
      const output = buildStandardSpeechOutput({
        taskType: 'sustained_vowel',
        features: { pitch_mean_hz: 180, voice_stability_index: 0.95 },
        quality: {
          status: 'valid',
          reasons: [],
          noiseFloorDb: -52,
          clippingFraction: 0,
          snrDb: 24,
          voicedDurationSec: 4.8,
          durationSec: 5.0,
          isComplete: true,
        },
        unavailable: [],
        sampleCount: 220500,
        isSimulated: true,
        language: 'en',
      });

      expect(output.assessment_type).toBe('speech');
      expect(output.task_name).toBe('sustained_vowel');
      expect(output.quality.status).toBe('valid');
      expect(output.evidence.sample_count).toBe(220500);
      expect(output.is_simulated).toBe(true);
    });
  });

  describe('Facial Movement & Symmetry Analysis', () => {
    it('estimates head pose (yaw/pitch) and normalizes perspective', () => {
      const mockLandmarks: FacialLandmark3D[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
      mockLandmarks[1] = { x: 0.5, y: 0.5 }; // nose
      mockLandmarks[234] = { x: 0.1, y: 0.5 }; // left ear
      mockLandmarks[454] = { x: 0.9, y: 0.5 }; // right ear (centered)

      const pose = estimateHeadPose(mockLandmarks);
      expect(Math.abs(pose.yawDeg)).toBeLessThan(5.0);

      // Skew left ear closer to nose simulating 20 deg head turn
      mockLandmarks[234] = { x: 0.35, y: 0.5 };
      const turnedPose = estimateHeadPose(mockLandmarks);
      expect(Math.abs(turnedPose.yawDeg)).toBeGreaterThan(10.0);
    });

    it('calculates eye aspect ratio (EAR) for blink detection', () => {
      const mockLandmarks: FacialLandmark3D[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
      mockLandmarks[33] = { x: 0.3, y: 0.4 };
      mockLandmarks[133] = { x: 0.4, y: 0.4 };
      mockLandmarks[159] = { x: 0.35, y: 0.37 };
      mockLandmarks[145] = { x: 0.35, y: 0.43 };

      const { leftEar } = calculateEyeAspectRatio(mockLandmarks);
      expect(leftEar).toBeGreaterThan(0.2);
    });

    it('extracts facial movement kinematics with head-pose compensation', () => {
      const frames: Array<{ landmarks: FacialLandmark3D[]; timestamp: number }> = [];
      for (let i = 0; i < 20; i++) {
        const lm: FacialLandmark3D[] = Array.from({ length: 468 }, () => ({ x: 0.5, y: 0.5 }));
        const t = i * 100;
        // Smile displacement
        lm[1] = { x: 0.5, y: 0.5 };
        lm[33] = { x: 0.35, y: 0.35 };
        lm[263] = { x: 0.65, y: 0.35 };
        lm[61] = { x: 0.42 - (i > 5 ? 0.04 : 0), y: 0.65 };
        lm[291] = { x: 0.58 + (i > 5 ? 0.04 : 0), y: 0.65 };
        frames.push({ landmarks: lm, timestamp: t });
      }

      const quality = evaluateFacialQuality(frames[0].landmarks, 0.95);
      const { metrics } = extractFacialTaskMetrics({
        task: 'smile',
        trial: 1,
        frames,
        quality,
      });

      expect(metrics.task).toBe('smile');
      expect(metrics.expression_amplitude_mm).toBeGreaterThan(0);
      expect(metrics.left_right_symmetry_ratio).toBeGreaterThan(0.85);
      expect(metrics.onset_to_peak_time_ms).toBeGreaterThan(0);
    });

    it('formats standard output schema for facial assessment', () => {
      const mockMetrics = {
        task: 'smile' as const,
        trial: 1 as const,
        expression_amplitude_mm: 12.4,
        left_right_symmetry_ratio: 0.94,
        movement_speed_mm_per_sec: 25.2,
        onset_to_peak_time_ms: 450,
        blink_rate_bpm: 18.0,
        blink_completeness_ratio: 0.95,
      };

      const output = buildStandardFacialOutput({
        taskType: 'smile',
        trial: 1,
        metrics: mockMetrics,
        quality: {
          status: 'valid',
          reasons: [],
          headPose: { yawDeg: 2.1, pitchDeg: 1.0, rollDeg: 0 },
          meanConfidence: 0.94,
          isPoseCompensated: true,
        },
        unavailable: [],
        sampleCount: 60,
        isSimulated: true,
      });

      expect(output.assessment_type).toBe('facial');
      expect(output.task_name).toBe('smile_trial_1');
      expect(output.features.expression_amplitude_mm).toBe(12.4);
      expect(output.is_simulated).toBe(true);
    });
  });
});
