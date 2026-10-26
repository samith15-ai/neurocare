import React, { useState, useEffect } from 'react';
import { Activity, Heart, CheckCircle2, ChevronRight, PhoneCall } from 'lucide-react';
import { useAuth } from '../../lib/authContext';
import { api } from '../../lib/api';
import { CaptureEngine } from '../capture/CaptureEngine';
import { FingerTappingAssessment } from '../assessments/FingerTappingAssessment';
import { SpeechAssessment } from '../assessments/SpeechAssessment';
import { FacialMovementAssessment } from '../assessments/FacialMovementAssessment';
import { GaitAssessment } from '../assessments/GaitAssessment';
import { BalanceAssessment } from '../assessments/BalanceAssessment';
import { CognitiveAssessment } from '../assessments/CognitiveAssessment';
import { LongitudinalChart } from '../monitoring/LongitudinalChart';
import { ReportView } from '../reports/ReportView';
import { DailyCheckinModal } from '../monitoring/DailyCheckinModal';
import { PrivacyConsentModal } from '../enrollment/PrivacyConsentModal';
import { offlineSyncManager, type SyncStatus } from '../../lib/offlineSync';
import type { Patient, TrajectoryPoint, Feature, Report, DailyCheckinStatus } from '../../types';

export const PatientDashboard: React.FC = () => {
  const { user } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [trajectoryPoints, setTrajectoryPoints] = useState<TrajectoryPoint[]>([]);
  const [showAssessment, setShowAssessment] = useState(false);
  const [showDailyCheckin, setShowDailyCheckin] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [checkinStatus, setCheckinStatus] = useState<DailyCheckinStatus | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    isOnline: true,
    pendingCount: 0,
    lastSyncTime: null,
    isSyncing: false,
  });
  const [assessmentMode, setAssessmentMode] = useState<
    'finger_tapping' | 'speech' | 'facial' | 'gait' | 'balance' | 'cognition' | 'multimodal'
  >('finger_tapping');
  const [latestReport, setLatestReport] = useState<Report | null>(null);
  const [assessmentSuccess, setAssessmentSuccess] = useState(false);

  useEffect(() => {
    const unsub = offlineSyncManager.subscribe((status) => {
      setSyncStatus(status);
    });

    async function initPatient() {
      try {
        const patients = await api.getPatients();
        // Match user's patient profile or pick first
        const p = patients.find((pt) => pt.user_id === user?.id) || patients[0];
        if (p) {
          setPatient(p);
          loadCheckinStatus(p.id);

          const longData = await api.getLongitudinal(p.id);
          setTrajectoryPoints(longData.trajectory_points);

          const rList = await fetch(`/api/v1/reports?patient_id=${p.id}`).then((r) => r.json());
          if (rList && rList.length > 0) {
            setLatestReport(rList[0]);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
    initPatient();

    return () => unsub();
  }, [user]);

  const loadCheckinStatus = async (patientId: string) => {
    try {
      const stat = await api.getTodayCheckinStatus(patientId);
      setCheckinStatus(stat);
    } catch {
      // offline or not found
    }
  };

  const handleAssessmentComplete = async (
    features: Feature[],
    isSimulated: boolean,
    qualityPassed: boolean,
    qualityNotes?: string
  ) => {
    if (!patient) return;
    try {
      const ass = await api.createAssessment({
        patient_id: patient.id,
        assessment_type: 'multimodal_standard',
        quality_gate_passed: qualityPassed,
        quality_notes: qualityNotes,
        is_simulated: isSimulated,
      });

      const featuresWithId = features.map((f) => ({ ...f, assessment_id: ass.id }));
      await api.saveFeatures(featuresWithId);

      const rep = await api.generateReport(ass.id);
      setLatestReport(rep);
      setShowAssessment(false);
      setAssessmentSuccess(true);

      const longData = await api.getLongitudinal(patient.id);
      setTrajectoryPoints(longData.trajectory_points);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="max-w-md mx-auto p-4 flex flex-col gap-5 pb-12">
      {/* Emergency FAST Callout Always Accessible */}
      <div className="bg-red-950/40 border border-red-800/60 p-3.5 rounded-2xl flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2.5">
          <Heart className="w-5 h-5 text-red-400" />
          <div>
            <div className="text-xs font-bold text-red-100">Need Immediate Assistance?</div>
            <div className="text-[11px] text-red-300">If experiencing sudden face drooping or limb weakness:</div>
          </div>
        </div>
        <a
          href="tel:911"
          className="bg-red-600 hover:bg-red-500 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow flex items-center gap-1"
        >
          <PhoneCall className="w-3.5 h-3.5" /> 911
        </a>
      </div>

      {/* Top Utilities Bar: Offline Sync Status & Privacy Consent */}
      <div className="flex items-center justify-between text-xs px-1">
        <div className="flex items-center space-x-2">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              syncStatus.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="text-slate-400 text-[11px]">
            {syncStatus.isOnline
              ? syncStatus.pendingCount > 0
                ? `${syncStatus.pendingCount} pending sync`
                : 'Cloud Synced ✓'
              : 'Offline Mode (Local Cache)'}
          </span>
          {syncStatus.isOnline && syncStatus.pendingCount > 0 && (
            <button
              onClick={() => offlineSyncManager.syncPendingQueue()}
              disabled={syncStatus.isSyncing}
              className="text-[10px] text-sky-400 hover:text-sky-300 font-bold ml-1 underline"
            >
              {syncStatus.isSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          )}
        </div>

        <button
          onClick={() => setShowPrivacyModal(true)}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center space-x-1 p-1 rounded-lg hover:bg-slate-800 transition"
        >
          <span>🛡️</span>
          <span>Privacy & Consent</span>
        </button>
      </div>

      {/* Welcome Card */}
      <div className="bg-gradient-to-br from-slate-900 to-sky-950/50 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-sky-400 uppercase tracking-wider">
            Patient Portal
          </span>
          <span className="text-[11px] text-slate-400">
            MRN: {patient?.mrn || 'Loading...'}
          </span>
        </div>
        <h1 className="text-xl font-black text-slate-100">
          Hello, {patient ? `${patient.first_name}` : 'Arthur'}!
        </h1>
        <p className="text-xs text-slate-300 leading-relaxed">
          Welcome to your personalized neurological companion. Daily check-ins track your steady movements and voice dynamics against your personal baseline.
        </p>
      </div>

      {/* Success Notification if finished */}
      {assessmentSuccess && (
        <div className="bg-emerald-950/40 border border-emerald-800/60 p-3.5 rounded-2xl text-xs text-emerald-200 flex items-center gap-2.5">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span>Your contactless check-in was successfully recorded and shared with your clinician.</span>
        </div>
      )}

      {/* Primary Today's Check-in Card */}
      <div className="bg-gradient-to-r from-emerald-950/40 to-slate-900 border border-emerald-500/30 rounded-3xl p-5 shadow-xl flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl text-lg">☀️</span>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Today&apos;s Daily Check-In</h2>
              <div className="text-[11px] text-slate-400 flex items-center space-x-2">
                <span>Reminder: {checkinStatus?.reminder_time || '09:00 AM'}</span>
                <span>•</span>
                <span>Finger Tapping + Speech</span>
              </div>
            </div>
          </div>

          {/* Streak Badge */}
          <div className="flex items-center space-x-1.5 px-3 py-1 bg-amber-500/15 border border-amber-500/30 rounded-full">
            <span className="text-sm">🔥</span>
            <span className="text-xs font-bold text-amber-300">
              {checkinStatus?.current_streak || 0}d
            </span>
          </div>
        </div>

        {checkinStatus?.is_completed_today ? (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Today&apos;s check-in complete! Great job maintaining your streak.</span>
            </div>
            <button
              onClick={() => setShowDailyCheckin(true)}
              className="text-[11px] font-bold text-slate-400 hover:text-white px-2 py-1 rounded-lg hover:bg-slate-800 transition"
            >
              Review
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDailyCheckin(true)}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-emerald-950/50 flex items-center justify-center space-x-2 text-xs transition active:scale-[0.98]"
          >
            <span>Start Today&apos;s Daily Check-in</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Daily Check-in Action Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-xl flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="bg-sky-500/20 text-sky-400 p-3 rounded-2xl border border-sky-500/30">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">Bilateral Finger-Tapping Check-In</h2>
            <p className="text-xs text-slate-400">Standardized 12s test per hand measuring tap frequency & rhythm.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
          <button
            type="button"
            onClick={() => {
              setAssessmentMode('finger_tapping');
              setShowAssessment(true);
            }}
            className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-2 rounded-2xl shadow-lg shadow-sky-950 flex items-center justify-center gap-1 text-xs transition active:scale-[0.98]"
          >
            <span>Finger Tapping</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAssessmentMode('speech');
              setShowAssessment(true);
            }}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-2 rounded-2xl shadow-lg shadow-indigo-950 flex items-center justify-center gap-1 text-xs transition active:scale-[0.98]"
          >
            <span>Voice & Speech</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAssessmentMode('facial');
              setShowAssessment(true);
            }}
            className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold py-3 px-2 rounded-2xl shadow-lg shadow-teal-950 flex items-center justify-center gap-1 text-xs transition active:scale-[0.98]"
          >
            <span>Facial Motion</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAssessmentMode('gait');
              setShowAssessment(true);
            }}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 px-2 rounded-2xl shadow-lg shadow-blue-950 flex items-center justify-center gap-1 text-xs transition active:scale-[0.98]"
          >
            <span>Walking Gait</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAssessmentMode('balance');
              setShowAssessment(true);
            }}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 px-2 rounded-2xl shadow-lg shadow-emerald-950 flex items-center justify-center gap-1 text-xs transition active:scale-[0.98]"
          >
            <span>Balance Test</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setAssessmentMode('cognition');
              setShowAssessment(true);
            }}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-2 rounded-2xl shadow-lg shadow-purple-950 flex items-center justify-center gap-1 text-xs transition active:scale-[0.98]"
          >
            <span>Cognitive Suite</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Longitudinal Progress Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">
          Your Movement Trends Over Time
        </h3>
        <LongitudinalChart points={trajectoryPoints} />
      </div>

      {/* Latest Clinician-Approved Report Summary */}
      {latestReport && (
        <ReportView
          report={latestReport}
          patient={patient || undefined}
          canApprove={false}
        />
      )}

      {/* Modal for Guided Assessment */}
      {showAssessment && patient && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col justify-center p-4 z-50 overflow-y-auto">
          <div className="max-w-md w-full mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-100">Guided Daily Assessment</h3>
              <button
                onClick={() => setShowAssessment(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold p-1"
              >
                ✕ Cancel
              </button>
            </div>

            {assessmentMode === 'finger_tapping' ? (
              <FingerTappingAssessment
                patientId={patient.id}
                onAssessmentCompleted={async (assId) => {
                  setShowAssessment(false);
                  setAssessmentSuccess(true);
                  try {
                    const rep = await api.getReportForAssessment(assId);
                    setLatestReport(rep);
                    const longData = await api.getLongitudinal(patient.id);
                    setTrajectoryPoints(longData.trajectory_points);
                  } catch {}
                }}
                onCancel={() => setShowAssessment(false)}
              />
            ) : assessmentMode === 'speech' ? (
              <SpeechAssessment
                patientId={patient.id}
                onAssessmentCompleted={async (assId) => {
                  setShowAssessment(false);
                  setAssessmentSuccess(true);
                  try {
                    const rep = await api.getReportForAssessment(assId);
                    setLatestReport(rep);
                    const longData = await api.getLongitudinal(patient.id);
                    setTrajectoryPoints(longData.trajectory_points);
                  } catch {}
                }}
                onCancel={() => setShowAssessment(false)}
              />
            ) : assessmentMode === 'facial' ? (
              <FacialMovementAssessment
                patientId={patient.id}
                onAssessmentCompleted={async (assId) => {
                  setShowAssessment(false);
                  setAssessmentSuccess(true);
                  try {
                    const rep = await api.getReportForAssessment(assId);
                    setLatestReport(rep);
                    const longData = await api.getLongitudinal(patient.id);
                    setTrajectoryPoints(longData.trajectory_points);
                  } catch {}
                }}
                onCancel={() => setShowAssessment(false)}
              />
            ) : assessmentMode === 'gait' ? (
              <GaitAssessment
                patientId={patient.id}
                onAssessmentCompleted={async (assId) => {
                  setShowAssessment(false);
                  setAssessmentSuccess(true);
                  try {
                    const rep = await api.getReportForAssessment(assId);
                    setLatestReport(rep);
                    const longData = await api.getLongitudinal(patient.id);
                    setTrajectoryPoints(longData.trajectory_points);
                  } catch {}
                }}
                onCancel={() => setShowAssessment(false)}
              />
            ) : assessmentMode === 'balance' ? (
              <BalanceAssessment
                patientId={patient.id}
                onAssessmentCompleted={async (assId) => {
                  setShowAssessment(false);
                  setAssessmentSuccess(true);
                  try {
                    const rep = await api.getReportForAssessment(assId);
                    setLatestReport(rep);
                    const longData = await api.getLongitudinal(patient.id);
                    setTrajectoryPoints(longData.trajectory_points);
                  } catch {}
                }}
                onCancel={() => setShowAssessment(false)}
              />
            ) : assessmentMode === 'cognition' ? (
              <CognitiveAssessment
                patientId={patient.id}
                onAssessmentCompleted={async (assId) => {
                  setShowAssessment(false);
                  setAssessmentSuccess(true);
                  try {
                    const rep = await api.getReportForAssessment(assId);
                    setLatestReport(rep);
                    const longData = await api.getLongitudinal(patient.id);
                    setTrajectoryPoints(longData.trajectory_points);
                  } catch {}
                }}
                onCancel={() => setShowAssessment(false)}
              />
            ) : (
              <CaptureEngine
                assessmentType="multimodal_standard"
                patientId={patient.id}
                onComplete={handleAssessmentComplete}
              />
            )}
          </div>
        </div>
      )}
      {/* Daily Check-in Modal */}
      {patient && (
        <DailyCheckinModal
          isOpen={showDailyCheckin}
          onClose={() => setShowDailyCheckin(false)}
          patient={patient}
          onCompleted={() => {
            loadCheckinStatus(patient.id);
            setAssessmentSuccess(true);
          }}
        />
      )}

      {/* Privacy & Consent Modal */}
      {patient && (
        <PrivacyConsentModal
          isOpen={showPrivacyModal}
          onClose={() => setShowPrivacyModal(false)}
          patientId={patient.id}
        />
      )}
    </div>
  );
};
