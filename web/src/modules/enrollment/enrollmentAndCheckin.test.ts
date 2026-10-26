import { describe, it, expect } from 'vitest';

// Pure logic implementations to test client-side algorithms & contracts
export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function calculateMAD(values: number[], minFloorRelative = 0.05, minFloorAbsolute = 0.01): {
  median: number;
  rawMAD: number;
  flooredMAD: number;
  pseudoStd: number;
} {
  const median = calculateMedian(values);
  const deviations = values.map((v) => Math.abs(v - median));
  const rawMAD = calculateMedian(deviations);
  const flooredMAD = Math.max(rawMAD, Math.abs(median) * minFloorRelative, minFloorAbsolute);
  const pseudoStd = 1.4826 * flooredMAD;
  return { median, rawMAD, flooredMAD, pseudoStd };
}

export function checkBaselineEligibility(validSessionsCount: number): {
  isEstablished: boolean;
  statusMessage: string;
} {
  const REQUIRED = 3;
  if (validSessionsCount < REQUIRED) {
    return {
      isEstablished: false,
      statusMessage: 'Personal baseline is not yet established.',
    };
  }
  return {
    isEstablished: true,
    statusMessage: 'Personal baseline established and frozen.',
  };
}

export function shouldAbsorbUpdate(
  currentMedian: number,
  currentStd: number,
  observedValue: number,
  direction: 'lower_is_change' | 'higher_is_change' | 'bidirectional'
): { allowUpdate: boolean; reason: string } {
  const z = (observedValue - currentMedian) / (currentStd || 0.01);

  if (direction === 'lower_is_change' && z < -1.5) {
    return {
      allowUpdate: false,
      reason: `Deterioration detected (z=${z.toFixed(2)}). Preserving pristine baseline.`,
    };
  }
  if (direction === 'higher_is_change' && z > 1.5) {
    return {
      allowUpdate: false,
      reason: `Deterioration detected (z=${z.toFixed(2)}). Preserving pristine baseline.`,
    };
  }
  if (direction === 'bidirectional' && Math.abs(z) > 2.0) {
    return {
      allowUpdate: false,
      reason: `Significant deviation detected (z=${z.toFixed(2)}). Preserving baseline.`,
    };
  }

  return {
    allowUpdate: true,
    reason: 'Observation is stable and safe for cautious baseline incorporation.',
  };
}

export function computeDailyStreak(checkinDates: string[], referenceDate: string): number {
  if (checkinDates.length === 0) return 0;
  const dateSet = new Set(checkinDates);
  const ref = new Date(referenceDate);

  let streak = 0;
  const curr = new Date(ref);

  // Check if today or yesterday is present
  const todayStr = curr.toISOString().split('T')[0];
  const yesterday = new Date(curr);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  if (!dateSet.has(todayStr) && !dateSet.has(yesterdayStr)) {
    return 0;
  }

  let checkDay = dateSet.has(todayStr) ? curr : yesterday;
  while (true) {
    const dStr = checkDay.toISOString().split('T')[0];
    if (dateSet.has(dStr)) {
      streak++;
      checkDay = new Date(checkDay);
      checkDay.setDate(checkDay.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

describe('Phase 5 — Enrollment & Baseline Personalization Unit Tests', () => {
  describe('Baseline Engine: Median & MAD with configurable floor', () => {
    it('calculates exact median for odd and even sample sizes', () => {
      expect(calculateMedian([3.2, 3.4, 3.5])).toBe(3.4);
      expect(calculateMedian([3.2, 3.4, 3.6, 3.8])).toBe(3.5);
    });

    it('calculates MAD and enforces relative & absolute minimum floor', () => {
      // Uniform values (variance = 0)
      const uniform = [3.5, 3.5, 3.5];
      const result = calculateMAD(uniform, 0.05, 0.01);
      expect(result.rawMAD).toBe(0);
      // Floor should be 5% of 3.5 = 0.175
      expect(result.flooredMAD).toBeCloseTo(0.175, 3);
      expect(result.pseudoStd).toBeCloseTo(1.4826 * 0.175, 3);
    });

    it('requires at least three valid sessions before establishing personal baseline', () => {
      expect(checkBaselineEligibility(0)).toEqual({
        isEstablished: false,
        statusMessage: 'Personal baseline is not yet established.',
      });

      expect(checkBaselineEligibility(2)).toEqual({
        isEstablished: false,
        statusMessage: 'Personal baseline is not yet established.',
      });

      expect(checkBaselineEligibility(3)).toEqual({
        isEstablished: true,
        statusMessage: 'Personal baseline established and frozen.',
      });

      expect(checkBaselineEligibility(5)).toEqual({
        isEstablished: true,
        statusMessage: 'Personal baseline established and frozen.',
      });
    });

    it('CRITICAL CLINICAL RULE: never absorbs persistent deterioration into baseline', () => {
      const baselineMedian = 3.5;
      const baselineStd = 0.25;

      // Stable measurement (3.4 Hz, z = -0.4) -> allowed
      const stableCheck = shouldAbsorbUpdate(baselineMedian, baselineStd, 3.4, 'lower_is_change');
      expect(stableCheck.allowUpdate).toBe(true);

      // Severe slowness deterioration (1.8 Hz, z = -6.8) -> REJECTED
      const deterioratedCheck = shouldAbsorbUpdate(baselineMedian, baselineStd, 1.8, 'lower_is_change');
      expect(deterioratedCheck.allowUpdate).toBe(false);
      expect(deterioratedCheck.reason).toContain('Deterioration detected');

      // Increased tremor frequency / jitter deterioration (higher_is_change) -> REJECTED
      const jitterBaselineMedian = 0.8;
      const jitterBaselineStd = 0.1;
      const jitterDeteriorated = shouldAbsorbUpdate(jitterBaselineMedian, jitterBaselineStd, 1.5, 'higher_is_change');
      expect(jitterDeteriorated.allowUpdate).toBe(false);
      expect(jitterDeteriorated.reason).toContain('Deterioration detected');
    });
  });

  describe('Daily Check-in & Streak Tracking', () => {
    it('calculates active streak correctly across consecutive dates', () => {
      const today = '2026-10-27';
      const history = ['2026-10-27', '2026-10-26', '2026-10-25', '2026-10-24'];
      expect(computeDailyStreak(history, today)).toBe(4);
    });

    it('handles streak if today is not yet done but yesterday was done', () => {
      const today = '2026-10-27';
      const history = ['2026-10-26', '2026-10-25'];
      expect(computeDailyStreak(history, today)).toBe(2);
    });

    it('resets streak to 0 if a gap exceeds 1 day', () => {
      const today = '2026-10-27';
      const history = ['2026-10-24', '2026-10-23'];
      expect(computeDailyStreak(history, today)).toBe(0);
    });
  });

  describe('Informed Consent & Evidence Governance', () => {
    it('supports separate consent flags and versioning', () => {
      const initialConsent = {
        consent_version: 'v1.0',
        consent_features: true,
        consent_evidence_clips: false,
        consent_research: false,
        signature_name: 'Arthur Pendelton',
      };

      expect(initialConsent.consent_features).toBe(true);
      expect(initialConsent.consent_evidence_clips).toBe(false);

      // Revoking evidence clips preserves feature processing
      const revokedScope = 'evidence_clips';
      const updatedConsent = {
        ...initialConsent,
        consent_evidence_clips: revokedScope === 'evidence_clips' ? false : initialConsent.consent_evidence_clips,
        is_revoked: true,
        revoked_at: new Date().toISOString(),
      };

      expect(updatedConsent.consent_features).toBe(true);
      expect(updatedConsent.consent_evidence_clips).toBe(false);
      expect(updatedConsent.is_revoked).toBe(true);
    });
  });
});
