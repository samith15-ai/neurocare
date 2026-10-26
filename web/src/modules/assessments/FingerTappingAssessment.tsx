import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
} from 'lucide-react';
import { CameraCaptureEngine } from '../capture/CameraCaptureEngine';
import {
  computeBilateralAsymmetry,
  type FingerTappingMetrics,
  type BilateralTappingSummary,
  type SignalSample,
  type QualityAssessment,
} from '../features/tappingSignal';
import { processTappingInWorker } from '../features/tappingWorker';
import { api } from '../../lib/api';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import type { Feature } from '../../types';

interface FingerTappingAssessmentProps {
  patientId: string;
  onAssessmentCompleted: (assessmentId: string) => void;
  onCancel: () => void;
}

type Step = 'INSTRUCTIONS' | 'RIGHT_HAND' | 'LEFT_HAND' | 'RESULTS';

export const FingerTappingAssessment: React.FC<FingerTappingAssessmentProps> = ({
  patientId,
  onAssessmentCompleted,
  onCancel,
}) => {
  const [currentStep, setCurrentStep] = useState<Step>('INSTRUCTIONS');
  const [consentToStoreRawClip, setConsentToStoreRawClip] = useState(false);

  // Results
  const [rightMetrics, setRightMetrics] = useState<FingerTappingMetrics | null>(null);
  const [leftMetrics, setLeftMetrics] = useState<FingerTappingMetrics | null>(null);
  const [bilateralSummary, setBilateralSummary] = useState<BilateralTappingSummary | null>(null);

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [isSimulatedData, setIsSimulatedData] = useState(false);

  const handleRightHandComplete = async (data: {
    samples: SignalSample[];
    quality: QualityAssessment;
    isSimulated: boolean;
  }) => {
    setIsSimulatedData(data.isSimulated);
    // Process via Web Worker
    const metrics = await processTappingInWorker(data.samples, 'right', data.quality.quality);
    setRightMetrics(metrics);
    setCurrentStep('LEFT_HAND');
  };

  const handleLeftHandComplete = async (data: {
    samples: SignalSample[];
    quality: QualityAssessment;
    isSimulated: boolean;
  }) => {
    const metrics = await processTappingInWorker(data.samples, 'left', data.quality.quality);
    setLeftMetrics(metrics);

    if (rightMetrics) {
      const summary = computeBilateralAsymmetry(rightMetrics, metrics);
      setBilateralSummary(summary);
    }
    setCurrentStep('RESULTS');
  };

  const handleSaveAndSubmit = async () => {
    if (!rightMetrics || !leftMetrics) return;

    setIsSubmitting(true);
    setSubmissionError(null);

    const overallQuality = bilateralSummary?.overall_quality ?? 'valid';
    const qualityGatePassed = overallQuality !== 'insufficient';

    try {
      // 1. Create Assessment record
      const assessment = await api.createAssessment({
        patient_id: patientId,
        assessment_type: 'motor',
        quality_gate_passed: qualityGatePassed,
        quality_notes: qualityGatePassed
          ? 'Standard 12s bilateral finger tapping completed with acceptable tracking.'
          : 'Insufficient recording quality. Hand was occluded or outside bounding frame.',
        is_simulated: isSimulatedData,
      });

      // 2. Compile granular traceable feature records
      const featuresToSave: Feature[] = [
        // Right Hand Features
        {
          assessment_id: assessment.id,
          domain: 'motor',
          feature_name: 'right_finger_tap_frequency_hz',
          value: rightMetrics.tap_frequency_hz,
          unit: 'Hz',
          confidence: rightMetrics.quality === 'valid' ? 0.95 : 0.70,
          is_simulated: isSimulatedData,
          raw_payload: JSON.stringify({
            tap_timestamps: rightMetrics.tap_timestamps,
            sample_count: rightMetrics.signal_samples.length,
          }),
        },
        {
          assessment_id: assessment.id,
          domain: 'motor',
          feature_name: 'right_finger_tap_mean_amplitude',
          value: rightMetrics.mean_amplitude,
          unit: 'ratio',
          confidence: 0.92,
          is_simulated: isSimulatedData,
        },
        {
          assessment_id: assessment.id,
          domain: 'motor',
          feature_name: 'right_finger_tap_amplitude_decay_slope',
          value: rightMetrics.amplitude_decrement_slope,
          unit: 'slope',
          confidence: 0.90,
          is_simulated: isSimulatedData,
        },
        {
          assessment_id: assessment.id,
          domain: 'motor',
          feature_name: 'right_finger_tap_iti_cv',
          value: rightMetrics.iti_cv,
          unit: 'ratio',
          confidence: 0.91,
          is_simulated: isSimulatedData,
        },
        {
          assessment_id: assessment.id,
          domain: 'motor',
          feature_name: 'right_finger_tap_hesitations',
          value: rightMetrics.hesitation_count,
          unit: 'count',
          confidence: 0.94,
          is_simulated: isSimulatedData,
        },
        // Left Hand Features
        {
          assessment_id: assessment.id,
          domain: 'motor',
          feature_name: 'left_finger_tap_frequency_hz',
          value: leftMetrics.tap_frequency_hz,
          unit: 'Hz',
          confidence: leftMetrics.quality === 'valid' ? 0.95 : 0.70,
          is_simulated: isSimulatedData,
          raw_payload: JSON.stringify({
            tap_timestamps: leftMetrics.tap_timestamps,
            sample_count: leftMetrics.signal_samples.length,
          }),
        },
        {
          assessment_id: assessment.id,
          domain: 'motor',
          feature_name: 'left_finger_tap_mean_amplitude',
          value: leftMetrics.mean_amplitude,
          unit: 'ratio',
          confidence: 0.92,
          is_simulated: isSimulatedData,
        },
        {
          assessment_id: assessment.id,
          domain: 'motor',
          feature_name: 'left_finger_tap_amplitude_decay_slope',
          value: leftMetrics.amplitude_decrement_slope,
          unit: 'slope',
          confidence: 0.90,
          is_simulated: isSimulatedData,
        },
        {
          assessment_id: assessment.id,
          domain: 'motor',
          feature_name: 'left_finger_tap_iti_cv',
          value: leftMetrics.iti_cv,
          unit: 'ratio',
          confidence: 0.91,
          is_simulated: isSimulatedData,
        },
        {
          assessment_id: assessment.id,
          domain: 'motor',
          feature_name: 'left_finger_tap_hesitations',
          value: leftMetrics.hesitation_count,
          unit: 'count',
          confidence: 0.94,
          is_simulated: isSimulatedData,
        },
        // Bilateral Asymmetry
        {
          assessment_id: assessment.id,
          domain: 'motor',
          feature_name: 'bilateral_tap_frequency_asymmetry',
          value: bilateralSummary?.frequency_asymmetry_ratio ?? 0,
          unit: 'ratio',
          confidence: 0.93,
          is_simulated: isSimulatedData,
        },
      ];

      await api.saveFeatures(featuresToSave);

      // 3. Generate clinical report
      await api.generateReport(assessment.id);

      onAssessmentCompleted(assessment.id);
    } catch (err: any) {
      console.error('Failed to submit tapping results', err);
      setSubmissionError(err.message || 'Error transmitting results to server');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 1: Instruction Screen
  if (currentStep === 'INSTRUCTIONS') {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl max-w-xl mx-auto flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-sky-500/20 text-sky-400 rounded-2xl border border-sky-500/30">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-100">Standardized Finger-Tapping Protocol</h2>
            <p className="text-xs text-slate-400">Standard MDS-UPDRS Item 3.4 Contactless Kinematics</p>
          </div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 text-xs text-slate-300">
          <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">Instructions for Patient:</h4>
          <ol className="list-decimal pl-4 flex flex-col gap-2">
            <li>Position your hand inside the guiding target frame facing the camera.</li>
            <li>Tap your thumb and index finger together <strong>as rapidly and as widely as possible</strong>.</li>
            <li>Maintain tapping steadily for 12 seconds per hand.</li>
            <li>You will perform the test first with your <strong>Right Hand</strong>, then your <strong>Left Hand</strong>.</li>
          </ol>
        </div>

        {/* Video Clip Consent */}
        <div className="bg-slate-950/40 border border-slate-800 p-3.5 rounded-xl flex items-start gap-3">
          <input
            type="checkbox"
            id="video-consent"
            checked={consentToStoreRawClip}
            onChange={(e) => setConsentToStoreRawClip(e.target.checked)}
            className="mt-1 rounded bg-slate-900 border-slate-700 text-sky-600 focus:ring-sky-500"
          />
          <label htmlFor="video-consent" className="text-xs text-slate-300 cursor-pointer">
            <strong className="block text-slate-200">Optional Video Recording Consent:</strong>
            Allow secure short clip storage for clinical review. By default, only extracted kinematic numeric features are stored.
          </label>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-3">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => setCurrentStep('RIGHT_HAND')}
            className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-sky-950 flex items-center gap-2"
          >
            <span>Begin Right Hand Test</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Step 2: Right Hand Capture
  if (currentStep === 'RIGHT_HAND') {
    return (
      <CameraCaptureEngine
        title="Finger Tapping: Right Hand"
        instructions="Tap thumb and index finger as fast and wide as possible within the frame."
        activeHand="right"
        durationSeconds={12}
        onComplete={handleRightHandComplete}
        onCancel={onCancel}
      />
    );
  }

  // Step 3: Left Hand Capture
  if (currentStep === 'LEFT_HAND') {
    return (
      <CameraCaptureEngine
        title="Finger Tapping: Left Hand"
        instructions="Switch to your Left Hand. Tap thumb and index finger as fast and wide as possible."
        activeHand="left"
        durationSeconds={12}
        onComplete={handleLeftHandComplete}
        onCancel={onCancel}
      />
    );
  }

  // Step 4: Results Review & Evidence Presentation
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl max-w-2xl mx-auto flex flex-col gap-5">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-100">Bilateral Finger Tapping Analysis</h2>
            {isSimulatedData && <SimulatedBadge />}
          </div>
          <p className="text-xs text-slate-400">MDS-UPDRS Kinematic Metrics & Evidence Traceability</p>
        </div>

        <span
          className={`text-xs px-2.5 py-1 rounded-full font-bold border ${
            bilateralSummary?.overall_quality === 'valid'
              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
              : bilateralSummary?.overall_quality === 'limited'
              ? 'bg-amber-950 text-amber-300 border-amber-800'
              : 'bg-red-950 text-red-300 border-red-800'
          }`}
        >
          Quality: {bilateralSummary?.overall_quality.toUpperCase()}
        </span>
      </div>

      {/* Quality Gate Retake Prompt if Insufficient */}
      {bilateralSummary?.overall_quality === 'insufficient' && (
        <div className="bg-red-950/40 border border-red-800/80 p-4 rounded-2xl flex flex-col gap-2 text-xs text-red-200">
          <div className="flex items-center gap-2 font-bold text-red-100">
            <AlertTriangle className="w-5 h-5 text-red-400" />
            <span>Insufficient Recording Quality — Retake Recommended</span>
          </div>
          <p>
            Due to poor lighting or hand positioning outside the frame, kinematic confidence is below clinical threshold.
            NeuroCare strictly forbids generating pathological findings from insufficient data.
          </p>
          <button
            type="button"
            onClick={() => setCurrentStep('RIGHT_HAND')}
            className="self-start mt-1 bg-red-600 hover:bg-red-500 text-white font-bold px-4 py-2 rounded-xl flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retake Assessment
          </button>
        </div>
      )}

      {/* Metrics Table */}
      {rightMetrics && leftMetrics && (
        <div className="grid grid-cols-2 gap-3 text-xs">
          {/* Right Hand Card */}
          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl flex flex-col gap-2">
            <h3 className="font-bold text-sky-400 uppercase tracking-wider text-[11px] border-b border-slate-800 pb-1">
              Right Hand ({rightMetrics.tap_count} taps)
            </h3>
            <div className="flex justify-between py-1 border-b border-slate-800/40">
              <span className="text-slate-400">Frequency</span>
              <span className="font-mono text-slate-200 font-bold">{rightMetrics.tap_frequency_hz} Hz</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/40">
              <span className="text-slate-400">Mean Amplitude</span>
              <span className="font-mono text-slate-200">{rightMetrics.mean_amplitude}x palm</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/40">
              <span className="text-slate-400">Amplitude Decay Slope</span>
              <span className="font-mono text-slate-200">{rightMetrics.amplitude_decrement_slope}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/40">
              <span className="text-slate-400">Rhythm CV (ITI)</span>
              <span className="font-mono text-slate-200">{(rightMetrics.iti_cv * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Hesitations</span>
              <span className="font-mono text-slate-200">{rightMetrics.hesitation_count}</span>
            </div>
          </div>

          {/* Left Hand Card */}
          <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-2xl flex flex-col gap-2">
            <h3 className="font-bold text-emerald-400 uppercase tracking-wider text-[11px] border-b border-slate-800 pb-1">
              Left Hand ({leftMetrics.tap_count} taps)
            </h3>
            <div className="flex justify-between py-1 border-b border-slate-800/40">
              <span className="text-slate-400">Frequency</span>
              <span className="font-mono text-slate-200 font-bold">{leftMetrics.tap_frequency_hz} Hz</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/40">
              <span className="text-slate-400">Mean Amplitude</span>
              <span className="font-mono text-slate-200">{leftMetrics.mean_amplitude}x palm</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/40">
              <span className="text-slate-400">Amplitude Decay Slope</span>
              <span className="font-mono text-slate-200">{leftMetrics.amplitude_decrement_slope}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-800/40">
              <span className="text-slate-400">Rhythm CV (ITI)</span>
              <span className="font-mono text-slate-200">{(leftMetrics.iti_cv * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Hesitations</span>
              <span className="font-mono text-slate-200">{leftMetrics.hesitation_count}</span>
            </div>
          </div>
        </div>
      )}

      {/* Bilateral Asymmetry Summary */}
      {bilateralSummary && (
        <div className="bg-slate-950/40 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between text-xs">
          <span className="text-slate-300 font-medium">Bilateral Frequency Asymmetry Ratio:</span>
          <span className="font-mono text-sky-400 font-bold">
            {bilateralSummary.frequency_asymmetry_ratio !== undefined
              ? `${(bilateralSummary.frequency_asymmetry_ratio * 100).toFixed(1)}%`
              : 'N/A'}
          </span>
        </div>
      )}

      {/* Error display */}
      {submissionError && (
        <div className="bg-red-950/40 border border-red-800/60 p-3 rounded-xl text-xs text-red-300">
          {submissionError}
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between border-t border-slate-800 pt-3">
        <button
          type="button"
          onClick={() => setCurrentStep('RIGHT_HAND')}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Retake Entire Test
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-2"
          >
            Discard
          </button>
          <button
            type="button"
            onClick={handleSaveAndSubmit}
            disabled={isSubmitting}
            className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg shadow-sky-950 flex items-center gap-1.5"
          >
            {isSubmitting ? 'Submitting Features...' : 'Save & Generate Report'}
          </button>
        </div>
      </div>
    </div>
  );
};
