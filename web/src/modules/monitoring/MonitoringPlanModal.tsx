import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { Patient } from '../../types';

interface MonitoringPlanModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
}

export const MonitoringPlanModal: React.FC<MonitoringPlanModalProps> = ({
  isOpen,
  onClose,
  patient,
}) => {
  const [tasks, setTasks] = useState<string[]>(['finger_tapping', 'speech']);
  const [frequency, setFrequency] = useState<string>('daily');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [durationDays, setDurationDays] = useState<number>(60);
  const [reminderTime, setReminderTime] = useState<string>('09:00');
  const [reminderEnabled, setReminderEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && patient.id) {
      loadPlan();
    }
  }, [isOpen, patient.id]);

  const loadPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      const plan = await api.getMonitoringPlan(patient.id);
      if (plan) {
        setTasks(plan.assessment_types.split(',').filter(Boolean));
        setFrequency(plan.frequency);
        setStartDate(plan.start_date);
        setDurationDays(plan.duration_days);
        setReminderTime(plan.reminder_time);
        setReminderEnabled(plan.reminder_enabled);
      }
    } catch {
      // Use defaults
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTask = (taskKey: string) => {
    setTasks((prev) =>
      prev.includes(taskKey) ? prev.filter((t) => t !== taskKey) : [...prev, taskKey]
    );
  };

  const handleSave = async () => {
    if (tasks.length === 0) {
      setError('Please select at least one assessment type.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.saveMonitoringPlan({
        patient_id: patient.id,
        assessment_types: tasks,
        frequency,
        start_date: startDate,
        duration_days: durationDays,
        reminder_time: reminderTime,
        reminder_enabled: reminderEnabled,
      });
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to save monitoring plan');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const AVAILABLE_TASKS = [
    { id: 'finger_tapping', name: 'Finger Tapping', icon: '👆', desc: '10s motor cadence & amplitude decay' },
    { id: 'speech', name: 'Speech Phonation', icon: '🎙️', desc: 'Sustained aaah & DDK rhythm' },
    { id: 'facial', name: 'Facial Expression', icon: '🙂', desc: 'Neutral, smile, eyebrow raise symmetry' },
    { id: 'gait', name: 'Walking Gait', icon: '🚶', desc: 'Corridor walking cadence & arm swing' },
    { id: 'balance', name: 'Postural Balance', icon: '⚖️', desc: 'Safety-screened Romberg quiet stance' },
    { id: 'cognition', name: 'Cognitive Suite', icon: '🧠', desc: 'SRT, Go/No-Go & spatial span' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg text-lg">📋</span>
            <div>
              <h3 className="font-semibold text-white">Configure Monitoring Plan</h3>
              <p className="text-xs text-slate-400">
                Patient: {patient.first_name} {patient.last_name} ({patient.mrn})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400">
              {error}
            </div>
          )}

          {savedSuccess && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
              ✓ Monitoring plan saved successfully!
            </div>
          )}

          {/* Assessment Types */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Included Assessment Types
            </label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_TASKS.map((task) => {
                const selected = tasks.includes(task.id);
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => handleToggleTask(task.id)}
                    className={`p-3 rounded-xl border text-left transition flex items-start space-x-2.5 ${
                      selected
                        ? 'bg-indigo-600/20 border-indigo-500 text-white'
                        : 'bg-slate-800/40 border-slate-700/60 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <span className="text-lg">{task.icon}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-xs text-white">{task.name}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-1">{task.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cadence & Schedule */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Frequency</label>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="daily">Daily Check-in (Recommended)</option>
                <option value="twice_weekly">Twice Weekly</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every 2 Weeks</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Monitoring Duration</label>
              <select
                value={durationDays}
                onChange={(e) => setDurationDays(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value={30}>30 Days (1 Month)</option>
                <option value={60}>60 Days (2 Months)</option>
                <option value={90}>90 Days (3 Months)</option>
                <option value={180}>180 Days (6 Months)</option>
                <option value={365}>365 Days (1 Year)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Reminder Time</label>
              <input
                type="time"
                value={reminderTime}
                onChange={(e) => setReminderTime(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Reminder Preferences Toggle */}
          <div className="pt-1">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={reminderEnabled}
                onChange={(e) => setReminderEnabled(e.target.checked)}
                className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-300 font-medium">
                Send in-app notifications and scheduled check-in reminders
              </span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-800/30 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Monitoring Plan'}
          </button>
        </div>
      </div>
    </div>
  );
};
