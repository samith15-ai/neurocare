import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  Square,
  RotateCcw,
  Volume2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  X,
} from 'lucide-react';
import { microphoneService } from '../../platform';
import {
  SPEECH_PROMPTS,
  evaluateAudioQuality,
  extractSustainedVowelFeatures,
  extractDDKFeatures,
  extractReadingPassageFeatures,
  type SpeechLanguage,
  type SpeechTaskType,
  type SpeechFeatures,
  type AudioQualityResult,
} from '../features/speechSignal';
import { api } from '../../lib/api';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import type { Feature } from '../../types';

interface SpeechAssessmentProps {
  patientId: string;
  onAssessmentCompleted: (assessmentId: string) => void;
  onCancel: () => void;
}

export const SpeechAssessment: React.FC<SpeechAssessmentProps> = ({
  patientId,
  onAssessmentCompleted,
  onCancel,
}) => {
  const [language, setLanguage] = useState<SpeechLanguage>('en');
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const taskOrder: SpeechTaskType[] = ['sustained_vowel', 'ddk_pataka', 'reading_passage'];
  const activeTaskType = taskOrder[currentTaskIndex];
  const activePrompt = SPEECH_PROMPTS[activeTaskType];

  // Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [isSimulated, setIsSimulated] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [liveSnr, setLiveSnr] = useState(24);

  // Quality & Features
  const [lastQuality, setLastQuality] = useState<AudioQualityResult | null>(null);
  const [taskResults, setTaskResults] = useState<Record<string, { features: SpeechFeatures; quality: AudioQualityResult }>>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const audioAccumulatorRef = useRef<Float32Array>(new Float32Array(0));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);

  // Real-time audio waveform visualizer
  const drawWaveform = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.beginPath();

    const buffer = audioAccumulatorRef.current;
    const sliceLength = 256;
    const recent = buffer.slice(-sliceLength);
    const sliceWidth = canvas.width / sliceLength;

    for (let i = 0; i < recent.length; i++) {
      const v = recent[i];
      const y = (canvas.height / 2) + v * (canvas.height / 2) * 1.5;
      if (i === 0) ctx.moveTo(0, y);
      else ctx.lineTo(i * sliceWidth, y);
    }
    ctx.stroke();

    if (isRecording) {
      animFrameRef.current = requestAnimationFrame(drawWaveform);
    }
  };

  useEffect(() => {
    let interval: any;
    if (isRecording) {
      interval = setInterval(() => {
        setElapsedSec((s) => s + 1);
      }, 1000);
      animFrameRef.current = requestAnimationFrame(drawWaveform);
    } else {
      setElapsedSec(0);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
    return () => {
      clearInterval(interval);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isRecording]);

  const handleStartRecording = async () => {
    setIsRecording(true);
    setLastQuality(null);
    audioAccumulatorRef.current = new Float32Array(0);

    if (!isSimulated) {
      try {
        await microphoneService.startRecording((audioData) => {
          const snr = microphoneService.computeSNR(audioData);
          setLiveSnr(Math.round(snr));

          // Accumulate buffer
          const updated = new Float32Array(audioAccumulatorRef.current.length + audioData.length);
          updated.set(audioAccumulatorRef.current);
          updated.set(audioData, audioAccumulatorRef.current.length);
          audioAccumulatorRef.current = updated;
        });
      } catch (e) {
        console.warn('Microphone unavailable, switching to simulated audio', e);
        setIsSimulated(true);
      }
    } else {
      // Generate synthetic vocal buffer at 44.1 kHz
      const sampleRate = 44100;
      const dur = activePrompt.targetDurationSeconds;
      const synth = new Float32Array(sampleRate * dur);
      const f0 = 175.0; // Hz
      for (let i = 0; i < synth.length; i++) {
        const t = i / sampleRate;
        const harm1 = Math.sin(2 * Math.PI * f0 * t) * 0.5;
        const harm2 = Math.sin(2 * Math.PI * f0 * 2 * t) * 0.25;
        synth[i] = harm1 + harm2 + (Math.random() - 0.5) * 0.02;
      }
      audioAccumulatorRef.current = synth;
    }
  };

  const handleStopRecording = async () => {
    setIsRecording(false);
    if (!isSimulated) {
      await microphoneService.stopRecording().catch(() => null);
    }

    const buffer = audioAccumulatorRef.current;
    const sampleRate = 44100;

    // Quality Check
    const quality = evaluateAudioQuality(buffer, sampleRate, activePrompt.targetDurationSeconds);
    setLastQuality(quality);

    // Extract Features depending on current task
    let features: SpeechFeatures = {};

    if (activeTaskType === 'sustained_vowel') {
      const res = extractSustainedVowelFeatures(buffer, sampleRate, quality);
      features = res.features;
    } else if (activeTaskType === 'ddk_pataka') {
      const res = extractDDKFeatures(buffer, sampleRate);
      features = res.features;
    } else {
      const res = extractReadingPassageFeatures(buffer, sampleRate, language);
      features = res.features;
    }

    // Save task result in memory
    setTaskResults((prev) => ({
      ...prev,
      [activeTaskType]: { features, quality },
    }));
  };

  const handleNextTask = () => {
    if (currentTaskIndex < taskOrder.length - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
      setLastQuality(null);
    } else {
      handleFinalizeAssessment();
    }
  };

  const handleRetakeTask = () => {
    setLastQuality(null);
    audioAccumulatorRef.current = new Float32Array(0);
    handleStartRecording();
  };

  const handleFinalizeAssessment = async () => {
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const hasInsufficient = Object.values(taskResults).some((r) => r.quality.status === 'insufficient');
      const qualityPassed = !hasInsufficient;

      // 1. Create Assessment
      const assessment = await api.createAssessment({
        patient_id: patientId,
        assessment_type: 'vocal',
        quality_gate_passed: qualityPassed,
        quality_notes: qualityPassed
          ? `Speech protocol completed in ${language.toUpperCase()}. Acoustic SNR valid across tasks.`
          : 'Insufficient audio recording quality due to low SNR or clipping.',
        is_simulated: isSimulated,
      });

      // 2. Compile granular traceable feature batch
      const featuresToSave: Feature[] = [];
      const vowel = taskResults['sustained_vowel']?.features;
      const ddk = taskResults['ddk_pataka']?.features;
      const reading = taskResults['reading_passage']?.features;

      if (vowel) {
        if (vowel.pitch_mean_hz !== undefined) {
          featuresToSave.push({
            assessment_id: assessment.id,
            domain: 'vocal',
            feature_name: 'speech_pitch_mean_hz',
            value: vowel.pitch_mean_hz,
            unit: 'Hz',
            confidence: 0.94,
            is_simulated: isSimulated,
          });
        }
        if (vowel.jitter_percent !== undefined) {
          featuresToSave.push({
            assessment_id: assessment.id,
            domain: 'vocal',
            feature_name: 'speech_jitter_percent',
            value: vowel.jitter_percent,
            unit: '%',
            confidence: 0.91,
            is_simulated: isSimulated,
          });
        }
        if (vowel.harmonics_to_noise_ratio_db !== undefined) {
          featuresToSave.push({
            assessment_id: assessment.id,
            domain: 'vocal',
            feature_name: 'harmonics_to_noise_ratio_db',
            value: vowel.harmonics_to_noise_ratio_db,
            unit: 'dB',
            confidence: 0.93,
            is_simulated: isSimulated,
          });
        }
      }

      if (ddk) {
        if (ddk.repetition_rate_hz !== undefined) {
          featuresToSave.push({
            assessment_id: assessment.id,
            domain: 'vocal',
            feature_name: 'ddk_syllable_rate_hz',
            value: ddk.repetition_rate_hz,
            unit: 'syllables/s',
            confidence: 0.95,
            is_simulated: isSimulated,
          });
        }
        if (ddk.repetition_regularity_cv !== undefined) {
          featuresToSave.push({
            assessment_id: assessment.id,
            domain: 'vocal',
            feature_name: 'ddk_regularity_cv',
            value: ddk.repetition_regularity_cv,
            unit: 'ratio',
            confidence: 0.92,
            is_simulated: isSimulated,
          });
        }
      }

      if (reading) {
        if (reading.speech_rate_syllables_sec !== undefined) {
          featuresToSave.push({
            assessment_id: assessment.id,
            domain: 'vocal',
            feature_name: 'reading_speech_rate',
            value: reading.speech_rate_syllables_sec,
            unit: 'syllables/s',
            confidence: 0.93,
            is_simulated: isSimulated,
          });
        }
        if (reading.pause_count !== undefined) {
          featuresToSave.push({
            assessment_id: assessment.id,
            domain: 'vocal',
            feature_name: 'reading_pause_count',
            value: reading.pause_count,
            unit: 'count',
            confidence: 0.95,
            is_simulated: isSimulated,
          });
        }
      }

      if (featuresToSave.length > 0) {
        await api.saveFeatures(featuresToSave);
      }

      // 3. Generate clinical report
      await api.generateReport(assessment.id);
      onAssessmentCompleted(assessment.id);
    } catch (err: any) {
      console.error('Failed to submit speech results', err);
      setSubmissionError(err.message || 'Error transmitting speech results');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl max-w-xl mx-auto flex flex-col gap-5">
      {/* Header & Language Selection */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Volume2 className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-slate-100">Speech & Voice Kinematics</h2>
            {isSimulated && <SimulatedBadge />}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Step {currentTaskIndex + 1} of 3 • {activePrompt.title[language]}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Language Picker */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {(['en', 'ta', 'hi'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(lang)}
                className={`text-xs px-2.5 py-1 rounded-lg font-bold uppercase transition ${
                  language === lang ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {lang}
              </button>
            ))}
          </div>

          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Task Instruction Card */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 flex flex-col gap-2">
        <span className="text-[11px] font-bold text-sky-400 uppercase tracking-wider">
          Task Prompt ({language.toUpperCase()}):
        </span>
        <p className="text-sm text-slate-200 font-medium leading-relaxed">
          {activePrompt.instructions[language]}
        </p>
        {activePrompt.passageText && (
          <div className="bg-slate-900 border border-slate-700/80 p-3 rounded-xl text-xs text-amber-200 font-serif leading-relaxed mt-1">
            "{activePrompt.passageText[language]}"
          </div>
        )}
      </div>

      {/* Live Audio Visualizer Canvas */}
      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1.5 font-semibold text-slate-300">
            <Mic className={`w-3.5 h-3.5 ${isRecording ? 'text-red-400 animate-pulse' : 'text-slate-500'}`} />
            Microphone Signal Waveform
          </span>
          <span className="font-mono text-sky-400 text-[11px]">Live SNR: {liveSnr} dB</span>
        </div>
        <div className="h-16 w-full relative">
          <canvas ref={canvasRef} width={500} height={64} className="w-full h-full" />
        </div>
      </div>

      {/* Quality Feedback / Retake Warning */}
      {lastQuality && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex flex-col gap-1.5 ${
            lastQuality.status === 'valid'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-200'
              : lastQuality.status === 'limited'
              ? 'bg-amber-950/40 border-amber-800/80 text-amber-200'
              : 'bg-red-950/40 border-red-800/80 text-red-200'
          }`}
        >
          <div className="flex items-center justify-between font-bold">
            <span className="flex items-center gap-1.5">
              {lastQuality.status === 'valid' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              )}
              Quality Status: {lastQuality.status.toUpperCase()} (SNR: {lastQuality.snrDb} dB)
            </span>
            <span className="font-mono text-[11px]">Voiced: {lastQuality.voicedDurationSec}s</span>
          </div>
          {lastQuality.reasons.length > 0 && (
            <p className="text-[11px] leading-relaxed mt-0.5">{lastQuality.reasons[0]}</p>
          )}
        </div>
      )}

      {/* Submission Error */}
      {submissionError && (
        <div className="bg-red-950/40 border border-red-800/60 p-3 rounded-xl text-xs text-red-300">
          {submissionError}
        </div>
      )}

      {/* Action Controls */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSimulated((s) => !s)}
            className="text-xs text-slate-400 hover:text-slate-200 bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 transition"
          >
            Mode: {isSimulated ? 'Simulated' : 'Microphone'}
          </button>
          {lastQuality && (
            <button
              type="button"
              onClick={handleRetakeTask}
              className="text-xs text-slate-400 hover:text-slate-200 bg-slate-800 px-3 py-2 rounded-xl border border-slate-700 transition flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Retake
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isRecording && !lastQuality ? (
            <button
              type="button"
              onClick={handleStartRecording}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950 flex items-center gap-2"
            >
              <Mic className="w-4 h-4" /> Start Recording ({activePrompt.targetDurationSeconds}s)
            </button>
          ) : isRecording ? (
            <button
              type="button"
              onClick={handleStopRecording}
              className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-red-950 flex items-center gap-2 animate-pulse"
            >
              <Square className="w-4 h-4 fill-current" /> Stop ({elapsedSec}s)
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNextTask}
              disabled={isSubmitting}
              className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-sky-950 flex items-center gap-2"
            >
              <span>{currentTaskIndex < taskOrder.length - 1 ? 'Next Task' : 'Finalize & Save'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
