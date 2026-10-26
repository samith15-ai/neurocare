/**
 * NeuroCare Phase 4 — Standardized Cognitive Assessment Battery
 * 1. Simple Reaction Time (SRT) with randomized jitter delay
 * 2. Go / No-Go Sustained Attention & Response Inhibition
 * 3. Short Sequence-Memory Spatial/Digit Span
 * Captures response times, commission/omission errors, device & input latency metadata.
 */

export interface DeviceMetadata {
  deviceType: 'desktop' | 'mobile' | 'tablet';
  userAgent: string;
  touchSupported: boolean;
  estimatedInputLatencyMs: number;
}

export interface ReactionTimeTrial {
  trialIndex: number;
  delayMs: number;
  stimulusTimestamp: number;
  responseTimestamp: number;
  reactionTimeMs: number;
  isAnticipation: boolean; // RT < 100ms
  isTimeout: boolean;      // RT > 2000ms
}

export interface GoNoGoTrial {
  trialIndex: number;
  stimulusType: 'go' | 'nogo';
  stimulusTimestamp: number;
  responseTimestamp?: number;
  reactionTimeMs?: number;
  correct: boolean;
  errorType?: 'commission' | 'omission'; // commission = pressed on nogo, omission = missed on go
}

export interface SequenceMemoryRound {
  sequenceLength: number;
  targetSequence: number[];
  userSequence: number[];
  isCorrect: boolean;
  durationMs: number;
}

export interface CognitiveBatteryRawData {
  deviceMetadata: DeviceMetadata;
  srtTrials: ReactionTimeTrial[];
  gonogoTrials: GoNoGoTrial[];
  sequenceRounds: SequenceMemoryRound[];
}

export interface CognitiveFeatures {
  simpleReactionTimeMedianMs: number;
  rtVariabilityMs: number;
  gonogoAccuracyPercent: number;
  gonogoFalseAlarmRate: number;
  gonogoMissRate: number;
  gonogoMedianRtMs: number;
  sequenceSpanLength: number;
  sequenceAccuracyPercent: number;
  totalCompletionTimeSec: number;
  deviceType: string;
  estimatedLatencyMs: number;
}

/**
 * Probes device environment and input latency.
 */
export function probeDeviceMetadata(): DeviceMetadata {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  let deviceType: 'desktop' | 'mobile' | 'tablet' = 'desktop';
  if (/iPad|Tablet/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/Mobi|Android|iPhone/i.test(ua) || (touch && window.innerWidth < 768)) {
    deviceType = 'mobile';
  }

  // Estimated baseline hardware input latency (touchscreens ~20-35ms, mouse/keyboard ~8-15ms)
  const estimatedInputLatencyMs = touch ? 28 : 12;

  return {
    deviceType,
    userAgent: ua,
    touchSupported: touch,
    estimatedInputLatencyMs,
  };
}

/**
 * Validates cognitive test performance and user engagement.
 * Rejects tests with extreme anticipations or complete disengagement.
 */
export function validateCognitiveQuality(data: CognitiveBatteryRawData): {
  quality: 'valid' | 'limited' | 'insufficient';
  reasons: string[];
} {
  const reasons: string[] = [];

  const validSrt = data.srtTrials.filter((t) => !t.isAnticipation && !t.isTimeout);
  if (validSrt.length < 3) {
    reasons.push('Too many premature anticipation taps or timeouts during reaction time test.');
  }

  if (data.gonogoTrials.length < 6) {
    reasons.push('Incomplete Go/No-Go attention task trials.');
  }

  const goTrials = data.gonogoTrials.filter((t) => t.stimulusType === 'go');
  const missedGo = goTrials.filter((t) => !t.correct).length;
  if (goTrials.length > 0 && missedGo / goTrials.length > 0.8) {
    reasons.push('High omission rate (>80% missed stimuli) indicates lack of task engagement.');
  }

  let quality: 'valid' | 'limited' | 'insufficient' = 'valid';
  if (reasons.length >= 2 || validSrt.length === 0) {
    quality = 'insufficient';
  } else if (reasons.length > 0) {
    quality = 'limited';
  }

  return { quality, reasons };
}

/**
 * Extracts standardized cognitive performance features.
 */
export function extractCognitiveFeatures(data: CognitiveBatteryRawData): CognitiveFeatures {
  // 1. Simple Reaction Time (SRT)
  const validSrt = data.srtTrials
    .filter((t) => !t.isAnticipation && !t.isTimeout)
    .map((t) => t.reactionTimeMs)
    .sort((a, b) => a - b);

  let srtMedian = 275.0;
  let srtVariability = 38.0;

  if (validSrt.length > 0) {
    const mid = Math.floor(validSrt.length / 2);
    srtMedian = validSrt.length % 2 !== 0 ? validSrt[mid] : (validSrt[mid - 1] + validSrt[mid]) / 2.0;

    const mean = validSrt.reduce((a, b) => a + b, 0) / validSrt.length;
    const variance = validSrt.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / validSrt.length;
    srtVariability = Number(Math.sqrt(variance).toFixed(1));
  }

  // 2. Go / No-Go Task
  let gonogoAcc = 94.0;
  let falseAlarmRate = 0.05;
  let missRate = 0.04;
  let gonogoRtMedian = 320.0;

  if (data.gonogoTrials.length > 0) {
    const totalTrials = data.gonogoTrials.length;
    const correctCount = data.gonogoTrials.filter((t) => t.correct).length;
    gonogoAcc = Number(((correctCount / totalTrials) * 100.0).toFixed(1));

    const nogoTrials = data.gonogoTrials.filter((t) => t.stimulusType === 'nogo');
    const commissions = nogoTrials.filter((t) => !t.correct).length;
    falseAlarmRate = nogoTrials.length > 0 ? Number((commissions / nogoTrials.length).toFixed(3)) : 0.0;

    const goTrials = data.gonogoTrials.filter((t) => t.stimulusType === 'go');
    const omissions = goTrials.filter((t) => !t.correct).length;
    missRate = goTrials.length > 0 ? Number((omissions / goTrials.length).toFixed(3)) : 0.0;

    const validGoRts = goTrials
      .filter((t) => t.correct && t.reactionTimeMs !== undefined)
      .map((t) => t.reactionTimeMs as number)
      .sort((a, b) => a - b);

    if (validGoRts.length > 0) {
      const mid = Math.floor(validGoRts.length / 2);
      gonogoRtMedian = validGoRts.length % 2 !== 0 ? validGoRts[mid] : (validGoRts[mid - 1] + validGoRts[mid]) / 2.0;
    }
  }

  // 3. Sequence Memory Span
  let maxSpan = 5;
  let seqAccuracy = 85.0;
  let totalSeqDurationMs = 0;

  if (data.sequenceRounds.length > 0) {
    const correctRounds = data.sequenceRounds.filter((r) => r.isCorrect);
    if (correctRounds.length > 0) {
      maxSpan = Math.max(...correctRounds.map((r) => r.sequenceLength));
    }
    seqAccuracy = Number(((correctRounds.length / data.sequenceRounds.length) * 100.0).toFixed(1));
    totalSeqDurationMs = data.sequenceRounds.reduce((acc, r) => acc + r.durationMs, 0);
  }

  const totalCompletionTimeSec = Number(
    (
      (data.srtTrials.length * 2500 + data.gonogoTrials.length * 1500 + totalSeqDurationMs) /
      1000.0
    ).toFixed(1)
  );

  return {
    simpleReactionTimeMedianMs: Math.round(srtMedian),
    rtVariabilityMs: srtVariability,
    gonogoAccuracyPercent: gonogoAcc,
    gonogoFalseAlarmRate: falseAlarmRate,
    gonogoMissRate: missRate,
    gonogoMedianRtMs: Math.round(gonogoRtMedian),
    sequenceSpanLength: maxSpan,
    sequenceAccuracyPercent: seqAccuracy,
    totalCompletionTimeSec,
    deviceType: data.deviceMetadata.deviceType,
    estimatedLatencyMs: data.deviceMetadata.estimatedInputLatencyMs,
  };
}

/**
 * Generates synthetic realistic cognitive battery trials for simulation or testing.
 */
export function simulateCognitiveAssessment(isAbnormal: boolean = false): CognitiveBatteryRawData {
  const device = probeDeviceMetadata();

  const baseRt = isAbnormal ? 410 : 265;
  const rtSd = isAbnormal ? 75 : 32;

  // 5 SRT trials
  const srtTrials: ReactionTimeTrial[] = [];
  for (let i = 0; i < 5; i++) {
    const noise = (Math.random() - 0.5) * 2 * rtSd;
    const rt = Math.round(Math.max(160, baseRt + noise));
    srtTrials.push({
      trialIndex: i,
      delayMs: 1500 + Math.floor(Math.random() * 1500),
      stimulusTimestamp: Date.now() + i * 2000,
      responseTimestamp: Date.now() + i * 2000 + rt,
      reactionTimeMs: rt,
      isAnticipation: rt < 100,
      isTimeout: rt > 2000,
    });
  }

  // 12 Go/No-Go trials (9 Go, 3 No-Go)
  const gonogoTrials: GoNoGoTrial[] = [];
  for (let i = 0; i < 12; i++) {
    const isNoGo = i === 3 || i === 7 || i === 10;
    if (isNoGo) {
      const commitError = isAbnormal && Math.random() < 0.45;
      gonogoTrials.push({
        trialIndex: i,
        stimulusType: 'nogo',
        stimulusTimestamp: Date.now() + 15000 + i * 1200,
        responseTimestamp: commitError ? Date.now() + 15000 + i * 1200 + 290 : undefined,
        reactionTimeMs: commitError ? 290 : undefined,
        correct: !commitError,
        errorType: commitError ? 'commission' : undefined,
      });
    } else {
      const omitError = isAbnormal && Math.random() < 0.15;
      const rt = Math.round(baseRt + 40 + (Math.random() - 0.5) * 50);
      gonogoTrials.push({
        trialIndex: i,
        stimulusType: 'go',
        stimulusTimestamp: Date.now() + 15000 + i * 1200,
        responseTimestamp: !omitError ? Date.now() + 15000 + i * 1200 + rt : undefined,
        reactionTimeMs: !omitError ? rt : undefined,
        correct: !omitError,
        errorType: omitError ? 'omission' : undefined,
      });
    }
  }

  // 3 Sequence rounds (length 3, 4, 5)
  const sequenceRounds: SequenceMemoryRound[] = [
    {
      sequenceLength: 3,
      targetSequence: [1, 4, 2],
      userSequence: [1, 4, 2],
      isCorrect: true,
      durationMs: 2400,
    },
    {
      sequenceLength: 4,
      targetSequence: [2, 0, 3, 1],
      userSequence: [2, 0, 3, 1],
      isCorrect: true,
      durationMs: 3100,
    },
    {
      sequenceLength: 5,
      targetSequence: [0, 3, 1, 4, 2],
      userSequence: isAbnormal ? [0, 3, 4, 1, 2] : [0, 3, 1, 4, 2],
      isCorrect: !isAbnormal,
      durationMs: 3900,
    },
  ];

  return {
    deviceMetadata: device,
    srtTrials,
    gonogoTrials,
    sequenceRounds,
  };
}
