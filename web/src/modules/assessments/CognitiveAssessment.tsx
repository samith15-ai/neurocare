import React, { useState, useEffect, useRef } from 'react';
import {
  Brain,
  Zap,
  Target,
  Grid,
  CheckCircle2,
  RotateCcw,
  Activity,
  ArrowRight,
  Smartphone,
  Laptop,
} from 'lucide-react';
import {
  probeDeviceMetadata,
  extractCognitiveFeatures,
  validateCognitiveQuality,
  simulateCognitiveAssessment,
  type ReactionTimeTrial,
  type GoNoGoTrial,
  type SequenceMemoryRound,
  type CognitiveBatteryRawData,
  type CognitiveFeatures,
} from '../features/cognitiveSignal';
import { api } from '../../lib/api';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import type { Feature } from '../../types';

interface CognitiveAssessmentProps {
  patientId: string;
  onAssessmentCompleted: (assessmentId: string) => void;
  onCancel: () => void;
}

type Step = 'INSTRUCTIONS' | 'SRT' | 'GONOGO' | 'SEQUENCE' | 'RESULTS';

export const CognitiveAssessment: React.FC<CognitiveAssessmentProps> = ({
  patientId,
  onAssessmentCompleted,
  onCancel,
}) => {
  const [currentStep, setCurrentStep] = useState<Step>('INSTRUCTIONS');
  const [isSimulatedData, setIsSimulatedData] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Raw Task Data
  const device = probeDeviceMetadata();
  const [srtTrials, setSrtTrials] = useState<ReactionTimeTrial[]>([]);
  const [gonogoTrials, setGonogoTrials] = useState<GoNoGoTrial[]>([]);
  const [sequenceRounds, setSequenceRounds] = useState<SequenceMemoryRound[]>([]);

  // Task 1: SRT State
  const [srtTrialIdx, setSrtTrialIdx] = useState(0);
  const [srtState, setSrtState] = useState<'IDLE' | 'WAITING' | 'READY' | 'FEEDBACK'>('IDLE');
  const [srtFeedback, setSrtFeedback] = useState<string | null>(null);
  const srtTimerRef = useRef<number | null>(null);
  const srtStimulusTimeRef = useRef<number>(0);

  // Task 2: Go/No-Go State
  const [gngIdx, setGngIdx] = useState(0);
  const [gngStimulus, setGngStimulus] = useState<'go' | 'nogo' | null>(null);
  const [gngActive, setGngActive] = useState(false);
  const gngStartTimeRef = useRef<number>(0);
  const gngTimeoutRef = useRef<number | null>(null);

  // Task 3: Sequence Memory State
  const [seqLength, setSeqLength] = useState(3);
  const [targetSeq, setTargetSeq] = useState<number[]>([]);
  const [userSeq, setUserSeq] = useState<number[]>([]);
  const [flashingIdx, setFlashingIdx] = useState<number | null>(null);
  const [isShowingSequence, setIsShowingSequence] = useState(false);

  // Final Results
  const [finalFeatures, setFinalFeatures] = useState<CognitiveFeatures | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (srtTimerRef.current) window.clearTimeout(srtTimerRef.current);
      if (gngTimeoutRef.current) window.clearTimeout(gngTimeoutRef.current);
    };
  }, []);

  // --- TASK 1: SRT LOGIC ---
  const startSrtTrial = () => {
    setSrtState('WAITING');
    setSrtFeedback(null);
    const delay = 1500 + Math.floor(Math.random() * 1800);
    srtTimerRef.current = window.setTimeout(() => {
      srtStimulusTimeRef.current = performance.now();
      setSrtState('READY');
    }, delay);
  };

  const handleSrtTap = () => {
    const now = performance.now();
    if (srtState === 'WAITING') {
      // Premature false start
      if (srtTimerRef.current) window.clearTimeout(srtTimerRef.current);
      setSrtFeedback('Too early! Wait for green.');
      setSrtState('FEEDBACK');
      const trial: ReactionTimeTrial = {
        trialIndex: srtTrialIdx,
        delayMs: 0,
        stimulusTimestamp: Date.now(),
        responseTimestamp: Date.now(),
        reactionTimeMs: 50,
        isAnticipation: true,
        isTimeout: false,
      };
      setSrtTrials((prev) => [...prev, trial]);
      nextSrtOrNextTask();
    } else if (srtState === 'READY') {
      const rt = Math.round(now - srtStimulusTimeRef.current);
      setSrtFeedback(`${rt} ms`);
      setSrtState('FEEDBACK');
      const trial: ReactionTimeTrial = {
        trialIndex: srtTrialIdx,
        delayMs: 1500,
        stimulusTimestamp: Date.now() - rt,
        responseTimestamp: Date.now(),
        reactionTimeMs: rt,
        isAnticipation: rt < 100,
        isTimeout: rt > 2000,
      };
      setSrtTrials((prev) => [...prev, trial]);
      nextSrtOrNextTask();
    }
  };

  const nextSrtOrNextTask = () => {
    setTimeout(() => {
      if (srtTrialIdx + 1 >= 5) {
        setCurrentStep('GONOGO');
        setSrtState('IDLE');
      } else {
        setSrtTrialIdx((prev) => prev + 1);
        startSrtTrial();
      }
    }, 1200);
  };

  // --- TASK 2: GO / NO-GO LOGIC ---
  const runGoNoGoTrial = (idx: number) => {
    if (idx >= 12) {
      setCurrentStep('SEQUENCE');
      startSequenceRound(3);
      return;
    }

    const isNoGo = idx === 2 || idx === 6 || idx === 9;
    const type = isNoGo ? 'nogo' : 'go';
    setGngStimulus(type);
    setGngActive(true);
    gngStartTimeRef.current = performance.now();

    // 900ms display window
    gngTimeoutRef.current = window.setTimeout(() => {
      setGngActive(false);
      setGngStimulus(null);

      // If user did not tap on GO, it's an omission error
      if (type === 'go') {
        setGonogoTrials((prev) => [
          ...prev,
          {
            trialIndex: idx,
            stimulusType: 'go',
            stimulusTimestamp: Date.now() - 900,
            correct: false,
            errorType: 'omission',
          },
        ]);
      } else {
        // Inhibited successfully on No-Go
        setGonogoTrials((prev) => [
          ...prev,
          {
            trialIndex: idx,
            stimulusType: 'nogo',
            stimulusTimestamp: Date.now() - 900,
            correct: true,
          },
        ]);
      }

      // Next trial after 500ms ISI
      setTimeout(() => {
        setGngIdx(idx + 1);
        runGoNoGoTrial(idx + 1);
      }, 500);
    }, 900);
  };

  const handleGoNoGoTap = () => {
    if (!gngActive || !gngStimulus) return;
    const rt = Math.round(performance.now() - gngStartTimeRef.current);
    if (gngTimeoutRef.current) window.clearTimeout(gngTimeoutRef.current);
    setGngActive(false);

    if (gngStimulus === 'go') {
      setGonogoTrials((prev) => [
        ...prev,
        {
          trialIndex: gngIdx,
          stimulusType: 'go',
          stimulusTimestamp: Date.now() - rt,
          responseTimestamp: Date.now(),
          reactionTimeMs: rt,
          correct: true,
        },
      ]);
    } else {
      // Commission error on No-Go
      setGonogoTrials((prev) => [
        ...prev,
        {
          trialIndex: gngIdx,
          stimulusType: 'nogo',
          stimulusTimestamp: Date.now() - rt,
          responseTimestamp: Date.now(),
          reactionTimeMs: rt,
          correct: false,
          errorType: 'commission',
        },
      ]);
    }

    setGngStimulus(null);
    setTimeout(() => {
      setGngIdx(gngIdx + 1);
      runGoNoGoTrial(gngIdx + 1);
    }, 500);
  };

  // --- TASK 3: SEQUENCE MEMORY LOGIC ---
  const startSequenceRound = (len: number) => {
    setSeqLength(len);
    setUserSeq([]);
    setIsShowingSequence(true);

    const seq: number[] = [];
    for (let i = 0; i < len; i++) {
      seq.push(Math.floor(Math.random() * 9));
    }
    setTargetSeq(seq);

    // Flash sequence items
    let step = 0;
    const interval = window.setInterval(() => {
      if (step < seq.length) {
        setFlashingIdx(seq[step]);
        setTimeout(() => setFlashingIdx(null), 400);
        step++;
      } else {
        window.clearInterval(interval);
        setFlashingIdx(null);
        setIsShowingSequence(false);
      }
    }, 700);
  };

  const handleTileClick = (idx: number) => {
    if (isShowingSequence) return;
    const nextSeq = [...userSeq, idx];
    setUserSeq(nextSeq);

    if (nextSeq.length === targetSeq.length) {
      // Evaluate round
      const isCorrect = nextSeq.every((v, i) => v === targetSeq[i]);
      const round: SequenceMemoryRound = {
        sequenceLength: targetSeq.length,
        targetSequence: targetSeq,
        userSequence: nextSeq,
        isCorrect,
        durationMs: 3000,
      };
      setSequenceRounds((prev) => [...prev, round]);

      if (seqLength < 5 && isCorrect) {
        setTimeout(() => startSequenceRound(seqLength + 1), 1000);
      } else {
        // Complete Battery
        finishBattery([...sequenceRounds, round]);
      }
    }
  };

  const finishBattery = (allRounds: SequenceMemoryRound[]) => {
    const rawData: CognitiveBatteryRawData = {
      deviceMetadata: device,
      srtTrials,
      gonogoTrials,
      sequenceRounds: allRounds,
    };
    const features = extractCognitiveFeatures(rawData);
    setFinalFeatures(features);
    setCurrentStep('RESULTS');
  };

  const handleSimulate = () => {
    setIsSimulatedData(true);
    const sim = simulateCognitiveAssessment(false);
    setSrtTrials(sim.srtTrials);
    setGonogoTrials(sim.gonogoTrials);
    setSequenceRounds(sim.sequenceRounds);
    const feats = extractCognitiveFeatures(sim);
    setFinalFeatures(feats);
    setCurrentStep('RESULTS');
  };

  const handleSubmit = async () => {
    if (!finalFeatures) return;
    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const rawData: CognitiveBatteryRawData = {
        deviceMetadata: device,
        srtTrials,
        gonogoTrials,
        sequenceRounds,
      };
      const quality = validateCognitiveQuality(rawData);

      const ass = await api.createAssessment({
        patient_id: patientId,
        assessment_type: 'cognition',
        quality_gate_passed: quality.quality !== 'insufficient',
        quality_notes: quality.reasons.join('; ') || 'Cognitive battery (SRT, Go/No-Go, Sequence Span) completed.',
        is_simulated: isSimulatedData,
      });

      const featuresPayload: Feature[] = [
        {
          id: '',
          assessment_id: ass.id,
          domain: 'cognition',
          feature_name: 'cognitive_simple_reaction_time_ms',
          value: finalFeatures.simpleReactionTimeMedianMs,
          unit: 'ms',
          confidence: 0.95,
          is_simulated: isSimulatedData,
        },
        {
          id: '',
          assessment_id: ass.id,
          domain: 'cognition',
          feature_name: 'cognitive_rt_variability_ms',
          value: finalFeatures.rtVariabilityMs,
          unit: 'ms',
          confidence: 0.94,
          is_simulated: isSimulatedData,
        },
        {
          id: '',
          assessment_id: ass.id,
          domain: 'cognition',
          feature_name: 'cognitive_gonogo_accuracy_percent',
          value: finalFeatures.gonogoAccuracyPercent,
          unit: '%',
          confidence: 0.96,
          is_simulated: isSimulatedData,
        },
        {
          id: '',
          assessment_id: ass.id,
          domain: 'cognition',
          feature_name: 'cognitive_gonogo_false_alarm_rate',
          value: finalFeatures.gonogoFalseAlarmRate,
          unit: 'ratio',
          confidence: 0.95,
          is_simulated: isSimulatedData,
        },
        {
          id: '',
          assessment_id: ass.id,
          domain: 'cognition',
          feature_name: 'cognitive_sequence_span_length',
          value: finalFeatures.sequenceSpanLength,
          unit: 'items',
          confidence: 0.93,
          is_simulated: isSimulatedData,
        },
      ];

      await api.saveFeatures(featuresPayload);
      await api.generateReport(ass.id);
      onAssessmentCompleted(ass.id);
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to submit cognitive evaluation.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-6 max-w-xl mx-auto select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-950/60 border border-indigo-800/80 rounded-2xl text-indigo-400">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              Neuro-Cognitive Assessment Battery
              {isSimulatedData && <SimulatedBadge />}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              {device.deviceType === 'mobile' ? (
                <Smartphone className="w-3.5 h-3.5 text-sky-400" />
              ) : (
                <Laptop className="w-3.5 h-3.5 text-sky-400" />
              )}
              <span>
                {device.deviceType.toUpperCase()} • ~{device.estimatedInputLatencyMs}ms Input Latency
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={onCancel}
          className="text-xs text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 px-3 py-1.5 rounded-xl transition"
        >
          Cancel
        </button>
      </div>

      {/* STEP 1: INSTRUCTIONS */}
      {currentStep === 'INSTRUCTIONS' && (
        <div className="flex flex-col gap-5">
          <div className="bg-slate-950/60 border border-slate-800/80 p-5 rounded-2xl flex flex-col gap-3">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              3-Part Cognitive Test Protocol
            </h3>
            <div className="space-y-3 text-xs text-slate-300">
              <div className="flex items-start gap-2.5">
                <Zap className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-100 font-semibold">1. Simple Reaction Time (5 Trials)</strong>
                  Tap the screen as fast as possible as soon as the target turns green.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Target className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-100 font-semibold">2. Go / No-Go Inhibition (12 Trials)</strong>
                  Tap immediately for <strong>GREEN</strong>. Do NOT tap for <strong>RED</strong>.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Grid className="w-4 h-4 text-sky-400 flex-shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-slate-100 font-semibold">3. Sequence Memory Span (3 Rounds)</strong>
                  Watch the tile sequence flash, then repeat the pattern in forward order.
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <button
              onClick={handleSimulate}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs py-3 px-4 rounded-xl border border-slate-700 transition"
            >
              Simulate Test Run
            </button>
            <button
              onClick={() => {
                setCurrentStep('SRT');
                startSrtTrial();
              }}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2"
            >
              <span>Begin Cognitive Test</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: SIMPLE REACTION TIME (SRT) */}
      {currentStep === 'SRT' && (
        <div className="flex flex-col items-center gap-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Part 1: Simple Reaction Time — Trial {srtTrialIdx + 1} of 5
          </div>

          <button
            type="button"
            onClick={handleSrtTap}
            className={`w-full h-64 rounded-3xl border-2 flex flex-col items-center justify-center transition-all duration-100 active:scale-95 ${
              srtState === 'WAITING'
                ? 'bg-slate-950 border-slate-800 text-slate-500'
                : srtState === 'READY'
                ? 'bg-emerald-500 border-emerald-400 text-white shadow-2xl shadow-emerald-500/50'
                : 'bg-slate-900 border-slate-700 text-slate-300'
            }`}
          >
            {srtState === 'WAITING' && (
              <span className="text-sm font-semibold tracking-wider uppercase animate-pulse">
                Wait for Green...
              </span>
            )}
            {srtState === 'READY' && (
              <span className="text-3xl font-black tracking-tight uppercase">
                TAP NOW!
              </span>
            )}
            {srtState === 'FEEDBACK' && (
              <div className="text-center">
                <span className="text-2xl font-black block text-sky-400">{srtFeedback}</span>
                <span className="text-[11px] text-slate-400 mt-1 block">Next trial coming up...</span>
              </div>
            )}
          </button>
        </div>
      )}

      {/* STEP 3: GO / NO-GO ATTENTION */}
      {currentStep === 'GONOGO' && (
        <div className="flex flex-col items-center gap-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Part 2: Go / No-Go Attention — Trial {gngIdx + 1} of 12
          </div>

          <div
            onClick={handleGoNoGoTap}
            className="w-full h-64 bg-slate-950 border border-slate-800 rounded-3xl flex flex-col items-center justify-center cursor-pointer transition active:scale-95"
          >
            {gngStimulus === 'go' && (
              <div className="w-32 h-32 rounded-full bg-emerald-500 flex items-center justify-center text-white font-black text-2xl shadow-2xl shadow-emerald-500/40 animate-in zoom-in-75">
                TAP
              </div>
            )}
            {gngStimulus === 'nogo' && (
              <div className="w-32 h-32 rounded-full bg-rose-600 flex items-center justify-center text-white font-black text-xl shadow-2xl shadow-rose-600/40 animate-in zoom-in-75">
                HOLD
              </div>
            )}
            {!gngStimulus && (
              <span className="text-xs text-slate-600 uppercase font-semibold tracking-wider">
                Watch screen carefully...
              </span>
            )}
          </div>

          <div className="flex justify-between w-full text-[11px] text-slate-400">
            <span>GREEN = Tap as fast as possible</span>
            <span>RED = Do not tap</span>
          </div>

          {gngIdx === 0 && !gngActive && (
            <button
              onClick={() => runGoNoGoTrial(0)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs py-2.5 px-6 rounded-xl shadow transition"
            >
              Start Go/No-Go
            </button>
          )}
        </div>
      )}

      {/* STEP 4: SEQUENCE MEMORY SPAN */}
      {currentStep === 'SEQUENCE' && (
        <div className="flex flex-col items-center gap-4">
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Part 3: Spatial Sequence Memory — Span Length {seqLength}
          </div>

          <div className="grid grid-cols-3 gap-3 p-4 bg-slate-950 border border-slate-800 rounded-3xl w-64 h-64">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((idx) => {
              const isFlashing = flashingIdx === idx;
              const isUserClicked = userSeq.includes(idx);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={isShowingSequence}
                  onClick={() => handleTileClick(idx)}
                  className={`rounded-2xl border transition-all duration-150 ${
                    isFlashing
                      ? 'bg-amber-400 border-amber-300 shadow-lg shadow-amber-400/50 scale-105'
                      : isUserClicked
                      ? 'bg-sky-600 border-sky-400 text-white font-bold'
                      : 'bg-slate-900 border-slate-800 hover:bg-slate-800/80 active:bg-slate-700'
                  }`}
                />
              );
            })}
          </div>

          <div className="text-xs text-slate-400">
            {isShowingSequence ? 'Watch the sequence flash...' : `Repeat sequence (${userSeq.length}/${seqLength} entered)`}
          </div>
        </div>
      )}

      {/* STEP 5: RESULTS */}
      {currentStep === 'RESULTS' && finalFeatures && (
        <div className="flex flex-col gap-5">
          <div className="bg-emerald-950/30 border border-emerald-500/40 p-3.5 rounded-xl text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Cognitive battery completed. Processing speed, response inhibition, and memory span profiled.</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Median SRT</span>
              <div className="text-xl font-black text-indigo-400 mt-0.5">
                {finalFeatures.simpleReactionTimeMedianMs} <span className="text-xs font-normal text-slate-400">ms</span>
              </div>
              <span className="text-[10px] text-slate-500">Ref: 275 ± 45ms</span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">RT Variability</span>
              <div className="text-xl font-black text-indigo-400 mt-0.5">
                {finalFeatures.rtVariabilityMs} <span className="text-xs font-normal text-slate-400">ms</span>
              </div>
              <span className="text-[10px] text-slate-500">Ref: 38 ± 14ms</span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Go/No-Go Accuracy</span>
              <div className="text-xl font-black text-indigo-400 mt-0.5">
                {finalFeatures.gonogoAccuracyPercent}%
              </div>
              <span className="text-[10px] text-slate-500">Ref: 94 ± 5%</span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">False Alarm Rate</span>
              <div className="text-xl font-black text-indigo-400 mt-0.5">
                {(finalFeatures.gonogoFalseAlarmRate * 100).toFixed(1)}%
              </div>
              <span className="text-[10px] text-slate-500">Commission errors (Ref: 5%)</span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Sequence Span</span>
              <div className="text-xl font-black text-indigo-400 mt-0.5">
                {finalFeatures.sequenceSpanLength} <span className="text-xs font-normal text-slate-400">items</span>
              </div>
              <span className="text-[10px] text-slate-500">Forward span (Ref: 5.5)</span>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-3 rounded-xl">
              <span className="text-[10px] font-bold text-slate-400 uppercase block">Input Latency</span>
              <div className="text-xl font-black text-indigo-400 mt-0.5">
                ~{finalFeatures.estimatedLatencyMs} <span className="text-xs font-normal text-slate-400">ms</span>
              </div>
              <span className="text-[10px] text-slate-500">{finalFeatures.deviceType} hardware</span>
            </div>
          </div>

          {errorMsg && (
            <div className="text-xs text-rose-400 bg-rose-950/30 p-2.5 rounded-xl border border-rose-800">
              {errorMsg}
            </div>
          )}

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => {
                setSrtTrials([]);
                setGonogoTrials([]);
                setSequenceRounds([]);
                setFinalFeatures(null);
                setSrtTrialIdx(0);
                setGngIdx(0);
                setCurrentStep('SRT');
                startSrtTrial();
              }}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs py-3 px-4 rounded-xl border border-slate-700 transition flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4 text-slate-400" />
              Retake Battery
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs py-3 px-4 rounded-xl shadow-lg transition flex items-center justify-center gap-2"
            >
              <Activity className="w-4 h-4" />
              {isSubmitting ? 'Saving...' : 'Accept & Record Cognition'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
