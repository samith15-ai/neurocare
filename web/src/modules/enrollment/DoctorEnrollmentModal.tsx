import React, { useState } from 'react';
import { api } from '../../lib/api';
import type { Invitation, Patient } from '../../types';

interface DoctorEnrollmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  patients: Patient[];
  selectedPatientId?: string;
}

export const DoctorEnrollmentModal: React.FC<DoctorEnrollmentModalProps> = ({
  isOpen,
  onClose,
  patients,
  selectedPatientId,
}) => {
  const [patientId, setPatientId] = useState<string>(selectedPatientId || '');
  const [email, setEmail] = useState<string>('');
  const [expiresDays, setExpiresDays] = useState<number>(7);
  const [loading, setLoading] = useState(false);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const inv = await api.createInvitation({
        patient_id: patientId || undefined,
        patient_email: email || undefined,
        expires_in_days: expiresDays,
      });
      setInvitation(inv);
    } catch (err: any) {
      setError(err.message || 'Failed to generate invitation');
    } finally {
      setLoading(false);
    }
  };

  const fullUrl = invitation
    ? `${window.location.origin}/enroll?code=${invitation.code}`
    : '';

  const handleCopy = () => {
    if (!fullUrl) return;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg text-lg">🎟️</span>
            <div>
              <h3 className="font-semibold text-white">Enroll New Patient</h3>
              <p className="text-xs text-slate-400">Generate secure onboarding invite & QR code</p>
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
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400">
              {error}
            </div>
          )}

          {!invitation ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Assign Existing Patient Record (Optional)
                </label>
                <select
                  value={patientId}
                  onChange={(e) => setPatientId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Unassigned (Patient registers details) --</option>
                  {patients.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.first_name} {p.last_name} ({p.mrn})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Patient Email Notification (Optional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="patient@example.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Invitation Validity Duration
                </label>
                <select
                  value={expiresDays}
                  onChange={(e) => setExpiresDays(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value={3}>3 Days</option>
                  <option value={7}>7 Days (Standard)</option>
                  <option value={14}>14 Days</option>
                  <option value={30}>30 Days</option>
                </select>
              </div>

              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-xs text-indigo-300">
                💡 Patients will be prompted to review data protection disclosures and provide separate consent for behavioral biomarkers and evidence clips before accessing monitoring.
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex flex-col items-center">
                <span className="text-3xl mb-1">✅</span>
                <h4 className="text-emerald-400 font-semibold text-sm">Invitation Created Successfully</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Share this invitation code or link with the patient.
                </p>

                {/* Invite Code Pill */}
                <div className="mt-4 px-6 py-3 bg-slate-800 border-2 border-indigo-500/50 rounded-2xl">
                  <span className="text-xs text-slate-400 uppercase tracking-wider block">Invite Code</span>
                  <span className="text-2xl font-mono font-bold text-white tracking-widest">{invitation.code}</span>
                </div>

                {/* Simulated QR Code SVG representation */}
                <div className="mt-4 p-3 bg-white rounded-xl shadow-inner flex flex-col items-center">
                  <svg className="w-32 h-32" viewBox="0 0 100 100" fill="none">
                    <rect width="100" height="100" fill="white" />
                    {/* Corners */}
                    <rect x="10" y="10" width="24" height="24" fill="black" />
                    <rect x="14" y="14" width="16" height="16" fill="white" />
                    <rect x="18" y="18" width="8" height="8" fill="black" />

                    <rect x="66" y="10" width="24" height="24" fill="black" />
                    <rect x="70" y="14" width="16" height="16" fill="white" />
                    <rect x="74" y="18" width="8" height="8" fill="black" />

                    <rect x="10" y="66" width="24" height="24" fill="black" />
                    <rect x="14" y="70" width="16" height="16" fill="white" />
                    <rect x="18" y="74" width="8" height="8" fill="black" />

                    {/* Data matrix dots */}
                    <rect x="42" y="14" width="6" height="6" fill="black" />
                    <rect x="52" y="24" width="6" height="6" fill="black" />
                    <rect x="42" y="34" width="6" height="6" fill="black" />
                    <rect x="52" y="44" width="6" height="6" fill="black" />
                    <rect x="14" y="44" width="6" height="6" fill="black" />
                    <rect x="24" y="52" width="6" height="6" fill="black" />
                    <rect x="66" y="44" width="6" height="6" fill="black" />
                    <rect x="76" y="52" width="6" height="6" fill="black" />
                    <rect x="42" y="66" width="6" height="6" fill="black" />
                    <rect x="52" y="76" width="6" height="6" fill="black" />
                    <rect x="66" y="76" width="6" height="6" fill="black" />
                    <rect x="76" y="66" width="6" height="6" fill="black" />
                  </svg>
                  <span className="text-[10px] text-slate-600 font-mono mt-1 font-semibold">Scan to Enroll</span>
                </div>

                <div className="w-full mt-4 flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={fullUrl}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 font-mono truncate"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold whitespace-nowrap transition"
                  >
                    {copied ? 'Copied! ✓' : 'Copy Link'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-800/30 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
          >
            {invitation ? 'Done' : 'Cancel'}
          </button>
          {!invitation && (
            <button
              onClick={handleCreate}
              disabled={loading}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition flex items-center space-x-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <span>Generate Invitation</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
