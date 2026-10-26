import React, { useEffect, useState } from 'react';
import { Users, UserPlus, Activity, Search, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';
import { CaptureEngine } from '../capture/CaptureEngine';
import { FingerTappingAssessment } from '../assessments/FingerTappingAssessment';
import { SpeechAssessment } from '../assessments/SpeechAssessment';
import { FacialMovementAssessment } from '../assessments/FacialMovementAssessment';
import { LongitudinalChart } from '../monitoring/LongitudinalChart';
import { ReportView } from '../reports/ReportView';
import { AIAssistant } from '../ai/AIAssistant';
import type { Patient, Report, TrajectoryPoint, Feature } from '../../types';

export const DoctorDashboard: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [trajectoryPoints, setTrajectoryPoints] = useState<TrajectoryPoint[]>([]);
  const [activeReport, setActiveReport] = useState<Report | null>(null);

  // Modals & Panels
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [assessmentType, setAssessmentType] = useState<'multimodal_standard' | 'facial' | 'motor' | 'vocal'>('multimodal_standard');

  // New Patient Form
  const [newMrn, setNewMrn] = useState(`NC-2026-${Math.floor(1000 + Math.random() * 9000)}`);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newDob, setNewDob] = useState('1965-01-01');
  const [newGender, setNewGender] = useState('Male');
  const [newNotes, setNewNotes] = useState('');

  useEffect(() => {
    loadPatients();
  }, []);

  async function loadPatients() {
    try {
      const list = await api.getPatients();
      setPatients(list);
      if (list.length > 0 && !selectedPatient) {
        selectPatient(list[0]);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function selectPatient(p: Patient) {
    setSelectedPatient(p);
    try {
      const longData = await api.getLongitudinal(p.id);
      setTrajectoryPoints(longData.trajectory_points);
    } catch {
      setTrajectoryPoints([]);
    }

    try {
      const rList = await fetch(`/api/v1/reports?patient_id=${p.id}`).then((r) => r.json());
      setActiveReport(rList[0] || null);
    } catch {
      setActiveReport(null);
    }
  }

  const handleEnrollPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFirstName || !newLastName) return;

    try {
      const created = await api.createPatient({
        mrn: newMrn,
        first_name: newFirstName,
        last_name: newLastName,
        date_of_birth: newDob,
        gender: newGender,
        primary_condition_notes: newNotes,
      });
      setShowEnrollModal(false);
      setNewFirstName('');
      setNewLastName('');
      setNewNotes('');
      setNewMrn(`NC-2026-${Math.floor(1000 + Math.random() * 9000)}`);
      await loadPatients();
      selectPatient(created);
    } catch (err) {
      console.error('Failed to enroll patient', err);
    }
  };

  const handleAssessmentComplete = async (
    features: Feature[],
    isSimulated: boolean,
    qualityPassed: boolean,
    qualityNotes?: string
  ) => {
    if (!selectedPatient) return;

    try {
      // 1. Create assessment record
      const ass = await api.createAssessment({
        patient_id: selectedPatient.id,
        assessment_type: assessmentType,
        quality_gate_passed: qualityPassed,
        quality_notes: qualityNotes,
        is_simulated: isSimulated,
      });

      // 2. Attach assessment ID and submit features
      const featuresWithId = features.map((f) => ({ ...f, assessment_id: ass.id }));
      await api.saveFeatures(featuresWithId);

      // 3. Generate clinical report
      const rep = await api.generateReport(ass.id);
      setShowAssessmentModal(false);

      // 4. Refresh patient view
      selectPatient(selectedPatient);
      setActiveReport(rep);
    } catch (e) {
      console.error('Failed to finalize assessment', e);
    }
  };

  const filteredPatients = patients.filter(
    (p) =>
      p.first_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.last_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.mrn.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 flex flex-col gap-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-100 flex items-center gap-2">
            Clinician Decision Support Console
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Contactless multimodal monitoring, longitudinal trajectories, and evidence-traceable evaluation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowEnrollModal(true)}
            className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 transition"
          >
            <UserPlus className="w-4 h-4 text-sky-400" />
            Enroll Patient
          </button>
          <button
            onClick={() => setShowAssessmentModal(true)}
            disabled={!selectedPatient}
            className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl flex items-center gap-2 shadow-lg shadow-sky-950 transition"
          >
            <Activity className="w-4 h-4" />
            Perform Assessment
          </button>
        </div>
      </div>

      {/* Main Grid: Left Patients Sidebar, Right Patient Details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Patient Cohort List */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3 shadow-xl h-fit">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-400" />
              Patient Cohort ({patients.length})
            </h2>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by name or MRN..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2 outline-none focus:border-sky-500"
            />
          </div>

          {/* List */}
          <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredPatients.map((p) => {
              const isSelected = selectedPatient?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => selectPatient(p)}
                  className={`text-left p-3 rounded-xl border transition flex items-center justify-between ${
                    isSelected
                      ? 'bg-sky-950/40 border-sky-600/60 shadow'
                      : 'bg-slate-950/40 border-slate-800/80 hover:bg-slate-800/40'
                  }`}
                >
                  <div>
                    <div className="font-bold text-xs text-slate-200">
                      {p.first_name} {p.last_name}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                      MRN: {p.mrn} • {p.gender}
                    </div>
                  </div>
                  <ArrowRight className={`w-3.5 h-3.5 ${isSelected ? 'text-sky-400' : 'text-slate-600'}`} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Active Patient Details, Trajectory & AI */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {selectedPatient ? (
            <>
              {/* Patient Banner */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-slate-100">
                      {selectedPatient.first_name} {selectedPatient.last_name}
                    </h2>
                    <span className="text-xs font-mono bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded border border-slate-700">
                      {selectedPatient.mrn}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    DOB: {selectedPatient.date_of_birth} • Gender: {selectedPatient.gender}
                  </p>
                  {selectedPatient.primary_condition_notes && (
                    <p className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800/80 p-2 rounded-lg mt-2">
                      Clinical Context: {selectedPatient.primary_condition_notes}
                    </p>
                  )}
                </div>
              </div>

              {/* Longitudinal Monitoring Chart */}
              <LongitudinalChart points={trajectoryPoints} />

              {/* Latest Report Section */}
              {activeReport && (
                <ReportView
                  report={activeReport}
                  patient={selectedPatient}
                  canApprove={true}
                  onApproved={(updated) => setActiveReport(updated)}
                />
              )}

              {/* Explainable AI Assistant */}
              <AIAssistant
                patientId={selectedPatient.id}
                assessmentId={activeReport?.assessment_id}
              />
            </>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
              Select or enroll a patient to inspect longitudinal biomarkers.
            </div>
          )}
        </div>
      </div>

      {/* Enroll Patient Modal */}
      {showEnrollModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <h3 className="text-base font-bold text-slate-100">Enroll New Patient</h3>
            <form onSubmit={handleEnrollPatient} className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Medical Record Number (MRN)</label>
                <input
                  type="text"
                  value={newMrn}
                  onChange={(e) => setNewMrn(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 font-mono"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">First Name</label>
                  <input
                    type="text"
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Last Name</label>
                  <input
                    type="text"
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Date of Birth</label>
                  <input
                    type="date"
                    value={newDob}
                    onChange={(e) => setNewDob(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Gender</label>
                  <select
                    value={newGender}
                    onChange={(e) => setNewGender(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Clinical Context / Notes</label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Primary condition, baseline observations..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5"
                />
              </div>

              <div className="flex items-center justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="text-xs text-slate-400 hover:text-slate-200 px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs px-4 py-2 rounded-lg"
                >
                  Save & Enroll
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Perform Assessment Modal */}
      {showAssessmentModal && selectedPatient && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-3xl w-full shadow-2xl flex flex-col gap-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-100">
                  Perform Contactless Neurological Assessment
                </h3>
                <p className="text-xs text-slate-400">
                  Patient: {selectedPatient.first_name} {selectedPatient.last_name} ({selectedPatient.mrn})
                </p>
              </div>
              <button
                onClick={() => setShowAssessmentModal(false)}
                className="text-slate-400 hover:text-slate-200 text-sm font-semibold p-1"
              >
                ✕ Close
              </button>
            </div>

            {/* Assessment Type Tabs */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              {(['multimodal_standard', 'facial', 'motor', 'vocal'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setAssessmentType(type)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg capitalize transition ${
                    assessmentType === type
                      ? 'bg-sky-600 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {type.replace('_', ' ')}
                </button>
              ))}
            </div>

            {/* Specialized Clinical Assessment Suite */}
            {assessmentType === 'motor' ? (
              <FingerTappingAssessment
                patientId={selectedPatient.id}
                onAssessmentCompleted={async (assId) => {
                  setShowAssessmentModal(false);
                  await selectPatient(selectedPatient);
                  try {
                    const rep = await api.getReportForAssessment(assId);
                    setActiveReport(rep);
                  } catch {}
                }}
                onCancel={() => setShowAssessmentModal(false)}
              />
            ) : assessmentType === 'vocal' ? (
              <SpeechAssessment
                patientId={selectedPatient.id}
                onAssessmentCompleted={async (assId) => {
                  setShowAssessmentModal(false);
                  await selectPatient(selectedPatient);
                  try {
                    const rep = await api.getReportForAssessment(assId);
                    setActiveReport(rep);
                  } catch {}
                }}
                onCancel={() => setShowAssessmentModal(false)}
              />
            ) : assessmentType === 'facial' ? (
              <FacialMovementAssessment
                patientId={selectedPatient.id}
                onAssessmentCompleted={async (assId) => {
                  setShowAssessmentModal(false);
                  await selectPatient(selectedPatient);
                  try {
                    const rep = await api.getReportForAssessment(assId);
                    setActiveReport(rep);
                  } catch {}
                }}
                onCancel={() => setShowAssessmentModal(false)}
              />
            ) : (
              <CaptureEngine
                assessmentType={assessmentType}
                patientId={selectedPatient.id}
                onComplete={handleAssessmentComplete}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};
