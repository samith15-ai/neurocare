import { describe, it, expect } from 'vitest';

/**
 * Client-side mirror of Longitudinal Change Detection & Recovery Tracking
 * Validates algorithmic rules, noise rejection, non-causal correlations, and safety constraints.
 */

export interface TrajectoryEntry {
  session: number;
  date: string;
  zScore: number;
  isValid: boolean;
}

export type TrajectoryClassification =
  | 'stable'
  | 'sudden_deviation'
  | 'gradual_change'
  | 'persistent_change'
  | 'improvement'
  | 'inconsistent';

export function classifyTrajectory(
  history: TrajectoryEntry[],
  threshold = 1.5
): {
  classification: TrajectoryClassification;
  guidance: string;
  consecutiveBeyondThreshold: number;
} {
  const validHistory = history.filter((h) => h.isValid);
  if (validHistory.length === 0) {
    return {
      classification: 'stable',
      guidance: 'Insufficient valid sessions to evaluate trajectory.',
      consecutiveBeyondThreshold: 0,
    };
  }

  const current = validHistory[validHistory.length - 1];
  const currentZ = current.zScore;
  const isCurrentlyBeyond = Math.abs(currentZ) >= threshold;

  // Single session abnormal check: strict single session rule
  if (validHistory.length === 1 && isCurrentlyBeyond) {
    return {
      classification: 'sudden_deviation',
      guidance: 'Observed once — repeat assessment recommended.',
      consecutiveBeyondThreshold: 1,
    };
  }

  // Count consecutive beyond threshold in same direction
  let consecutiveCount = 0;
  const directionSign = Math.sign(currentZ);

  for (let i = validHistory.length - 1; i >= 0; i--) {
    const entry = validHistory[i];
    if (Math.abs(entry.zScore) >= threshold && Math.sign(entry.zScore) === directionSign) {
      consecutiveCount++;
    } else {
      break;
    }
  }

  // 1. Persistent Change: at least 3 consecutive sessions in same direction
  if (consecutiveCount >= 3) {
    return {
      classification: 'persistent_change',
      guidance: `Confirmed persistent shift across ${consecutiveCount} consecutive sessions. Clinical review recommended.`,
      consecutiveBeyondThreshold: consecutiveCount,
    };
  }

  // 2. Single abnormal session rule with history
  if (consecutiveCount === 1) {
    // If previous was nominal
    const prev = validHistory[validHistory.length - 2];
    if (Math.abs(prev.zScore) < threshold) {
      return {
        classification: 'sudden_deviation',
        guidance: 'Observed once — repeat assessment recommended.',
        consecutiveBeyondThreshold: 1,
      };
    }
  }

  // 3. Gradual change: 2 consecutive beyond threshold trending outward
  if (consecutiveCount === 2) {
    return {
      classification: 'gradual_change',
      guidance: 'Developing behavioral change observed across 2 sessions. Monitoring closely.',
      consecutiveBeyondThreshold: 2,
    };
  }

  // 4. Improvement: previous was beyond threshold, current returned toward baseline
  if (!isCurrentlyBeyond && validHistory.length >= 2) {
    const prev = validHistory[validHistory.length - 2];
    if (Math.abs(prev.zScore) >= threshold && Math.abs(currentZ) < Math.abs(prev.zScore)) {
      return {
        classification: 'improvement',
        guidance: 'Behavioral measures returning toward personal baseline.',
        consecutiveBeyondThreshold: 0,
      };
    }
  }

  // 5. Inconsistent / Stable
  if (!isCurrentlyBeyond) {
    return {
      classification: 'stable',
      guidance: 'Behavioral features remain within nominal baseline variance.',
      consecutiveBeyondThreshold: 0,
    };
  }

  return {
    classification: 'inconsistent',
    guidance: 'Fluctuating behavioral readings without sustained directionality.',
    consecutiveBeyondThreshold: consecutiveCount,
  };
}

export function calculateRecoveryIndex(
  currentZ: number,
  peakZ: number
): {
  recoveryIndex: number;
  uncertaintyPct: number;
  disclaimer: string;
} {
  const DISCLAIMER =
    'Experimental Index: For exploratory longitudinal visualization only. Not a clinically validated diagnostic outcome or recovery prognosis.';

  const absPeak = Math.abs(peakZ);
  const absCurrent = Math.abs(currentZ);

  if (absPeak < 0.2) {
    return {
      recoveryIndex: 100.0,
      uncertaintyPct: 5.0,
      disclaimer: DISCLAIMER,
    };
  }

  const rawFraction = 1.0 - absCurrent / absPeak;
  const clampedIndex = Math.max(0.0, Math.min(100.0, rawFraction * 100.0));
  const uncertainty = Math.min(25.0, Math.max(5.0, absCurrent * 4.0));

  return {
    recoveryIndex: parseFloat(clampedIndex.toFixed(1)),
    uncertaintyPct: parseFloat(uncertainty.toFixed(1)),
    disclaimer: DISCLAIMER,
  };
}

export function detectPlateau(
  recoverySeries: number[],
  minSessions = 3,
  deltaThresholdPct = 2.0,
  maxPlateauLevelPct = 80.0
): {
  isPlateau: boolean;
  note?: string;
} {
  if (recoverySeries.length < minSessions) {
    return { isPlateau: false };
  }

  const recent = recoverySeries.slice(-minSessions);
  const minVal = Math.min(...recent);
  const maxVal = Math.max(...recent);
  const delta = maxVal - minVal;

  if (delta <= deltaThresholdPct && maxVal < maxPlateauLevelPct) {
    return {
      isPlateau: true,
      note: `Recovery stalled within ${delta.toFixed(1)}% across ${minSessions} consecutive sessions below target (current: ${recent[recent.length - 1].toFixed(1)}%).`,
    };
  }

  return { isPlateau: false };
}

export function generateNonCausalCorrelation(
  eventTitle: string,
  eventDateStr: string,
  onsetDateStr: string
): string {
  const eventTime = new Date(eventDateStr).getTime();
  const onsetTime = new Date(onsetDateStr).getTime();
  const diffDays = Math.round((onsetTime - eventTime) / (1000 * 60 * 60 * 24));

  if (diffDays >= 0) {
    return `Observed behavioral change began ${diffDays} days after recorded event "${eventTitle}" (${eventDateStr}). (Observational temporal correlation only; does not establish clinical causation).`;
  } else {
    return `Recorded event "${eventTitle}" occurred ${Math.abs(diffDays)} days after initial change onset (${onsetDateStr}). (Observational temporal correlation only; does not establish clinical causation).`;
  }
}

// ---------------------- Vitest Unit Tests ----------------------

describe('Phase 6: Longitudinal Intelligence & Recovery Tracking', () => {
  it('strictly produces "Observed once — repeat assessment recommended." for a single abnormal session', () => {
    const singleSession: TrajectoryEntry[] = [
      { session: 1, date: '2026-10-20', zScore: 2.4, isValid: true },
    ];

    const result = classifyTrajectory(singleSession, 1.5);
    expect(result.classification).toBe('sudden_deviation');
    expect(result.guidance).toBe('Observed once — repeat assessment recommended.');
    expect(result.consecutiveBeyondThreshold).toBe(1);
  });

  it('preserves single session recommendation when following nominal sessions (sudden noise spike)', () => {
    const history: TrajectoryEntry[] = [
      { session: 1, date: '2026-10-18', zScore: 0.2, isValid: true },
      { session: 2, date: '2026-10-19', zScore: -0.3, isValid: true },
      { session: 3, date: '2026-10-20', zScore: 2.1, isValid: true }, // Sudden outlier
    ];

    const result = classifyTrajectory(history, 1.5);
    expect(result.classification).toBe('sudden_deviation');
    expect(result.guidance).toBe('Observed once — repeat assessment recommended.');
    expect(result.consecutiveBeyondThreshold).toBe(1);
  });

  it('requires at least 3 consecutive sessions in the same direction for persistent_change', () => {
    const twoSessions: TrajectoryEntry[] = [
      { session: 1, date: '2026-10-18', zScore: 0.1, isValid: true },
      { session: 2, date: '2026-10-19', zScore: 1.8, isValid: true },
      { session: 3, date: '2026-10-20', zScore: 2.2, isValid: true },
    ];
    // 2 consecutive beyond threshold -> gradual_change
    const res2 = classifyTrajectory(twoSessions, 1.5);
    expect(res2.classification).toBe('gradual_change');
    expect(res2.consecutiveBeyondThreshold).toBe(2);

    // 3 consecutive beyond threshold -> persistent_change
    const threeSessions: TrajectoryEntry[] = [
      ...twoSessions,
      { session: 4, date: '2026-10-21', zScore: 2.5, isValid: true },
    ];
    const res3 = classifyTrajectory(threeSessions, 1.5);
    expect(res3.classification).toBe('persistent_change');
    expect(res3.guidance).toContain('Confirmed persistent shift across 3 consecutive sessions');
    expect(res3.consecutiveBeyondThreshold).toBe(3);
  });

  it('does not treat missing or invalid sessions as worsening ("missing is not abnormal")', () => {
    const withGaps: TrajectoryEntry[] = [
      { session: 1, date: '2026-10-15', zScore: 0.2, isValid: true },
      { session: 2, date: '2026-10-16', zScore: 0.0, isValid: false }, // Missed session
      { session: 3, date: '2026-10-17', zScore: 0.0, isValid: false }, // Missed session
      { session: 4, date: '2026-10-18', zScore: 0.1, isValid: true },
    ];

    const result = classifyTrajectory(withGaps, 1.5);
    expect(result.classification).toBe('stable');
    expect(result.consecutiveBeyondThreshold).toBe(0);
    expect(result.guidance).toContain('within nominal baseline variance');
  });

  it('identifies improvement when measures return toward baseline after an elevation', () => {
    const history: TrajectoryEntry[] = [
      { session: 1, date: '2026-10-18', zScore: 2.5, isValid: true },
      { session: 2, date: '2026-10-19', zScore: 0.8, isValid: true },
    ];

    const result = classifyTrajectory(history, 1.5);
    expect(result.classification).toBe('improvement');
    expect(result.guidance).toContain('returning toward personal baseline');
  });

  it('correctly calculates Experimental Recovery Index and clamps between 0 and 100', () => {
    // Peak 3.0, current 1.5 -> 50% recovery
    const mid = calculateRecoveryIndex(1.5, 3.0);
    expect(mid.recoveryIndex).toBe(50.0);
    expect(mid.disclaimer).toContain('Experimental Index: For exploratory longitudinal visualization only.');

    // Peak 3.0, current 0.0 -> 100% recovery
    const full = calculateRecoveryIndex(0.0, 3.0);
    expect(full.recoveryIndex).toBe(100.0);

    // Peak 3.0, current 3.6 (worse) -> clamped to 0%
    const worse = calculateRecoveryIndex(3.6, 3.0);
    expect(worse.recoveryIndex).toBe(0.0);
  });

  it('detects a trajectory plateau when recovery delta is <= 2% across >= 3 sessions below 80%', () => {
    const plateauSeries = [45.0, 52.0, 60.0, 60.8, 61.2, 61.5]; // last 3 are within 0.7% (< 2%) and < 80%
    const detection = detectPlateau(plateauSeries, 3, 2.0, 80.0);
    expect(detection.isPlateau).toBe(true);
    expect(detection.note).toContain('Recovery stalled within 0.7% across 3 consecutive sessions');

    // Progressing series should not trigger plateau
    const progressingSeries = [45.0, 52.0, 60.0, 66.0, 72.0, 78.0];
    const noPlateau = detectPlateau(progressingSeries, 3, 2.0, 80.0);
    expect(noPlateau.isPlateau).toBe(false);

    // Plateau near or above 80% should not trigger (near full recovery)
    const highSeries = [84.0, 84.5, 84.8];
    const highPlateau = detectPlateau(highSeries, 3, 2.0, 80.0);
    expect(highPlateau.isPlateau).toBe(false);
  });

  it('enforces non-causal observational phrasing for treatment event correlations', () => {
    const correlation = generateNonCausalCorrelation(
      'Baclofen dosage increase',
      '2026-10-10',
      '2026-10-14'
    );
    expect(correlation).toContain('Observed behavioral change began 4 days after recorded event "Baclofen dosage increase"');
    expect(correlation).toContain('(Observational temporal correlation only; does not establish clinical causation).');
    expect(correlation).not.toContain('caused');
  });
});
