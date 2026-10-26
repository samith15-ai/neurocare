import React, { useState } from 'react';
import { api } from '../../lib/api';
import { offlineSyncManager } from '../../lib/offlineSync';
import { networkService } from '../../platform';
import type { DailyCheckin, Feature, Patient } from '../../types';

interface DailyCheckinModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  onCompleted?: () => void;
}

export const DailyCheckinModal: React.FC<DailyCheckinModalProps> = ({
  isOpen,
  onClose,
  patient,
  onCompleted,
}) => {
  const [step, setStep] = useState<'context' | 'tasks' | 'complete'>('context');

  // Context tags (Contextual variables, NOT neurological findings)
  const [medTaken, setMedTaken] = useState(true);
  const [medNotes, setMedNotes] = useState('Prescribed dosage taken on schedule');
  const [sleepQuality, setSleepQuality] = useState(4);
  const [fatigueLevel, setFatigueLevel] = useState(2);
  const [painLevel, setPainLevel] = useState(1);
  const [stressLevel, setStressLevel] = useState(2);

  // Task simulation / execution
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [streakResult, setStreakResult] = useState<number>(1);
  const [isOfflineSaved, setIsOfflineSaved] = useState(false);

  if (!isOpen) return null;

  const handleCompleteTask = (taskName: string) => {
    if (!completedTasks.includes(taskName)) {
      setCompletedTasks([...completedTasks, taskName]);
    }
  };

  const handleFinishCheckin = async () => {
    setSubmitting(true);
    const todayStr = new Date().toISOString().split('T')[0];
    const idempotencyKey = `CHK-${patient.id.substring(0, 8)}-${todayStr}`;

    const checkinPayload: Omit<DailyCheckin, 'idempotency_key' | 'is_synced'> & { idempotency_key?: string } = {
      patient_id: patient.id,
      checkin_date: todayStr,
      idempotency_key: idempotencyKey,
      medication_taken: medTaken,
      medication_notes: medNotes,
      sleep_quality: sleepQuality,
      fatigue_level: fatigueLevel,
      pain_level: painLevel,
      stress_level: stressLevel,
    };

    // Synthesize biomimetic check-in features
    const generatedFeatures: Feature[] = [
      {
        assessment_id: `chk_assess_${Date.now()}`,
        domain: 'motor',
        feature_name: 'right_finger_tap_frequency_hz',
        value: Number((3.3 + (Math.random() * 0.3 - 0.15)).toFixed(2)),
        unit: 'Hz',
        confidence: 0.95,
        is_simulated: true,
      },
      {
        assessment_id: `chk_assess_${Date.now()}`,
        domain: 'motor',
        feature_name: 'right_finger_tap_mean_amplitude',
        value: Number((0.52 + (Math.random() * 0.04 - 0.02)).toFixed(2)),
        unit: 'ratio',
        confidence: 0.94,
        is_simulated: true,
      },
      {
        assessment_id: `chk_assess_${Date.now()}`,
        domain: 'speech',
        feature_name: 'vocal_jitter_percent',
        value: Number((0.78 + (Math.random() * 0.1 - 0.05)).toFixed(2)),
        unit: '%',
        confidence: 0.96,
        is_simulated: true,
      },
    ];

    try {
      const isOnline = await networkService.isOnline();
      if (!isOnline) {
        // Offline-First IndexedDB caching
        await offlineSyncManager.queueCheckin(checkinPayload, generatedFeatures);
        setIsOfflineSaved(true);
        setStreakResult(1);
      } else {
        // Direct online submission
        await api.submitDailyCheckin({
          ...checkinPayload,
          idempotency_key: idempotencyKey,
        });
        const stat = await api.getTodayCheckinStatus(patient.id).catch(() => null);
        setStreakResult(stat?.current_streak || 1);
        setIsOfflineSaved(false);
      }

      setStep('complete');
      if (onCompleted) onCompleted();
    } catch (err: any) {
      // Fallback to offline queue
      await offlineSyncManager.queueCheckin(checkinPayload, generatedFeatures);
      setIsOfflineSaved(true);
      setStep('complete');
      if (onCompleted) onCompleted();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg text-lg">☀️</span>
            <div>
              <h3 className="font-semibold text-white">Daily Neurological Check-in</h3>
              <p className="text-xs text-slate-400">
                {step === 'context' && 'Step 1: Daily Context Variables'}
                {step === 'tasks' && 'Step 2: Quick Micro-Assessments'}
                {step === 'complete' && 'Check-in Completed'}
              </p>
            </div>
          </div>
          {step !== 'complete' && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
            >
              ✕
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {step === 'context' && (
            <div className="space-y-4">
              {/* Important clinical boundary notice */}
              <div className="p-2.5 bg-slate-800/80 border border-slate-700 rounded-xl text-[11px] text-slate-400 flex items-center space-x-2">
                <span>ℹ️</span>
                <span>Context variables help interpret daily performance. They are <strong>contextual variables, not neurological findings</strong>.</span>
              </div>

              {/* Medication */}
              <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-3.5 space-y-2">
                <label className="flex items-center justify-between cursor-pointer">
                  <span className="text-xs font-semibold text-white">Medication Taken Today?</span>
                  <input
                    type="checkbox"
                    checked={medTaken}
                    onChange={(e) => setMedTaken(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 text-emerald-500 focus:ring-emerald-500"
                  />
                </label>
                {medTaken && (
                  <input
                    type="text"
                    value={medNotes}
                    onChange={(e) => setMedNotes(e.target.value)}
                    placeholder="e.g. Levodopa 100mg at 8:00 AM"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                )}
              </div>

              {/* Likert Scale Selectors */}
              <div className="grid grid-cols-2 gap-3">
                {/* Sleep Quality */}
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-3">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Sleep Quality (1–5)
                  </label>
                  <div className="flex justify-between items-center space-x-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setSleepQuality(val)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                          sleepQuality === val
                            ? 'bg-emerald-600 text-white shadow-md'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1 text-center">
                    {sleepQuality <= 2 ? 'Restless' : sleepQuality === 3 ? 'Average' : 'Restful'}
                  </span>
                </div>

                {/* Fatigue Level */}
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-3">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Fatigue Level (1–5)
                  </label>
                  <div className="flex justify-between items-center space-x-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setFatigueLevel(val)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                          fatigueLevel === val
                            ? 'bg-amber-600 text-white shadow-md'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1 text-center">
                    {fatigueLevel <= 2 ? 'Energetic' : fatigueLevel === 3 ? 'Mild' : 'Severe'}
                  </span>
                </div>

                {/* Pain Level */}
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-3">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Pain / Discomfort (1–5)
                  </label>
                  <div className="flex justify-between items-center space-x-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setPainLevel(val)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                          painLevel === val
                            ? 'bg-rose-600 text-white shadow-md'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1 text-center">
                    {painLevel === 1 ? 'None' : painLevel <= 3 ? 'Moderate' : 'Severe'}
                  </span>
                </div>

                {/* Stress Level */}
                <div className="bg-slate-800/40 border border-slate-700/60 rounded-2xl p-3">
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Stress Level (1–5)
                  </label>
                  <div className="flex justify-between items-center space-x-1">
                    {[1, 2, 3, 4, 5].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setStressLevel(val)}
                        className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                          stressLevel === val
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-1 text-center">
                    {stressLevel <= 2 ? 'Calm' : stressLevel === 3 ? 'Moderate' : 'High'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 'tasks' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Complete these 2 quick tasks to measure motor and vocal consistency:
              </p>

              {/* Task 1: Finger Tapping */}
              <div className="p-3.5 bg-slate-800/50 border border-slate-700 rounded-2xl flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">👆</span>
                  <div>
                    <h4 className="text-xs font-bold text-white">Finger Tapping (10s)</h4>
                    <p className="text-[10px] text-slate-400">Rapid index-to-thumb rhythm</p>
                  </div>
                </div>
                {completedTasks.includes('tapping') ? (
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30">
                    Done ✓
                  </span>
                ) : (
                  <button
                    onClick={() => handleCompleteTask('tapping')}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
                  >
                    Perform Task
                  </button>
                )}
              </div>

              {/* Task 2: Speech Phonation */}
              <div className="p-3.5 bg-slate-800/50 border border-slate-700 rounded-2xl flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl p-2 bg-purple-500/20 text-purple-400 rounded-xl">🎙️</span>
                  <div>
                    <h4 className="text-xs font-bold text-white">Speech Phonation (5s)</h4>
                    <p className="text-[10px] text-slate-400">Sustained &quot;aaah&quot; acoustic test</p>
                  </div>
                </div>
                {completedTasks.includes('speech') ? (
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30">
                    Done ✓
                  </span>
                ) : (
                  <button
                    onClick={() => handleCompleteTask('speech')}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold transition"
                  >
                    Perform Task
                  </button>
                )}
              </div>

              {/* Task 3: Facial Expression (Optional) */}
              <div className="p-3.5 bg-slate-800/30 border border-slate-700/60 rounded-2xl flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">🙂</span>
                  <div>
                    <h4 className="text-xs font-bold text-white">Facial Hold (Optional)</h4>
                    <p className="text-[10px] text-slate-400">Smile symmetry holding test</p>
                  </div>
                </div>
                {completedTasks.includes('facial') ? (
                  <span className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-xl border border-emerald-500/30">
                    Done ✓
                  </span>
                ) : (
                  <button
                    onClick={() => handleCompleteTask('facial')}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-xl text-xs font-semibold transition"
                  >
                    Include Task
                  </button>
                )}
              </div>
            </div>
          )}

          {step === 'complete' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 mx-auto bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center text-3xl animate-bounce">
                🎉
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Check-in Complete!</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Thank you for keeping your personalized monitoring active.
                </p>
              </div>

              {/* Streak badge */}
              <div className="inline-flex items-center space-x-2 px-5 py-2.5 bg-amber-500/15 border border-amber-500/30 rounded-2xl">
                <span className="text-xl">🔥</span>
                <span className="text-sm font-bold text-amber-300">
                  {streakResult} Day Streak!
                </span>
              </div>

              {isOfflineSaved && (
                <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl text-[11px] text-blue-300">
                  💾 Saved locally (Offline mode). Your check-in will automatically sync to your doctor once you reconnect.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-800/30 flex justify-end space-x-3">
          {step === 'context' && (
            <>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('tasks')}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition"
              >
                Next: Perform Tasks →
              </button>
            </>
          )}

          {step === 'tasks' && (
            <>
              <button
                onClick={() => setStep('context')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
              >
                Back
              </button>
              <button
                onClick={handleFinishCheckin}
                disabled={submitting || (!completedTasks.includes('tapping') && !completedTasks.includes('speech'))}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50 flex items-center space-x-2"
              >
                {submitting ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Submitting Check-in...</span>
                  </>
                ) : (
                  <span>Submit Daily Check-in ✓</span>
                )}
              </button>
            </>
          )}

          {step === 'complete' && (
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition"
            >
              Back to Dashboard
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
