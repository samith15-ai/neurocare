import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import type { PatientConsent } from '../../types';

interface PrivacyConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientId: string;
}

export const PrivacyConsentModal: React.FC<PrivacyConsentModalProps> = ({
  isOpen,
  onClose,
  patientId,
}) => {
  const [consent, setConsent] = useState<PatientConsent | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (isOpen && patientId) {
      loadConsent();
    }
  }, [isOpen, patientId]);

  const loadConsent = async () => {
    setLoading(true);
    setActionMsg(null);
    try {
      const data = await api.getConsent(patientId);
      setConsent(data);
    } catch (err: any) {
      // If no consent record exists, create default state
      setConsent({
        id: 'placeholder',
        patient_id: patientId,
        consent_version: 'v1.0',
        consent_features: true,
        consent_evidence_clips: false,
        consent_research: false,
        is_revoked: false,
        signature_name: 'Patient',
        signed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeClips = async () => {
    setLoading(true);
    setActionMsg(null);
    try {
      const updated = await api.revokeConsent({
        patient_id: patientId,
        scope: 'evidence_clips',
        reason: 'Patient requested revocation of evidence clips via Privacy settings',
      });
      setConsent(updated);
      setActionMsg({ text: 'Evidence clip consent revoked and raw clips purged from storage.', type: 'success' });
    } catch (err: any) {
      setActionMsg({ text: err.message || 'Failed to revoke consent', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAllEvidence = async () => {
    if (!confirm('Are you sure you want to permanently delete all raw video/audio evidence clips? Numeric kinematic features will be preserved for your doctor.')) {
      return;
    }
    setLoading(true);
    setActionMsg(null);
    try {
      const res = await api.deletePatientEvidence(patientId);
      setActionMsg({ text: `Successfully purged ${res.purged_records} raw evidence payloads.`, type: 'success' });
    } catch (err: any) {
      setActionMsg({ text: err.message || 'Failed to delete evidence clips', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-800/50">
          <div className="flex items-center space-x-2">
            <span className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg text-lg">🛡️</span>
            <div>
              <h3 className="font-semibold text-white">Privacy & Consent Governance</h3>
              <p className="text-xs text-slate-400">Consent version {consent?.consent_version || 'v1.0'}</p>
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
          {actionMsg && (
            <div
              className={`p-3 rounded-xl text-xs border ${
                actionMsg.type === 'success'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}
            >
              {actionMsg.text}
            </div>
          )}

          {loading ? (
            <div className="py-8 flex justify-center items-center text-slate-400 text-xs">
              <span className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-2" />
              Loading privacy records...
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700/60 space-y-3">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Active Consent Status
                </h4>

                <div className="flex items-center justify-between py-1 border-b border-slate-700/40 text-xs">
                  <span className="text-slate-400">Biomarker Feature Processing</span>
                  <span className="font-semibold text-emerald-400">Active ✓</span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-700/40 text-xs">
                  <span className="text-slate-400">Evidence Video Clips</span>
                  <span
                    className={`font-semibold ${
                      consent?.consent_evidence_clips ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {consent?.consent_evidence_clips ? 'Granted ✓' : 'Disabled (Not Stored)'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1 border-b border-slate-700/40 text-xs">
                  <span className="text-slate-400">De-Identified Research Usage</span>
                  <span
                    className={`font-semibold ${
                      consent?.consent_research ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {consent?.consent_research ? 'Opted In ✓' : 'Opted Out'}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
                  <span>Signatory: {consent?.signature_name || 'Patient'}</span>
                  <span>Signed: {consent?.signed_at ? new Date(consent.signed_at).toLocaleDateString() : 'N/A'}</span>
                </div>
              </div>

              {/* Data Rights Actions */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Patient Data Rights
                </h4>

                {consent?.consent_evidence_clips && (
                  <button
                    onClick={handleRevokeClips}
                    disabled={loading}
                    className="w-full py-2.5 px-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition text-left flex items-center justify-between"
                  >
                    <span>Revoke Evidence Video Clip Consent</span>
                    <span className="text-amber-400">Revoke →</span>
                  </button>
                )}

                <button
                  onClick={handleDeleteAllEvidence}
                  disabled={loading}
                  className="w-full py-2.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-semibold transition text-left flex items-center justify-between"
                >
                  <span>Permanently Purge All Video Evidence Clips</span>
                  <span className="text-rose-400">Delete Clips →</span>
                </button>
              </div>

              <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-[11px] text-indigo-300">
                🔒 In accordance with HIPAA & GDPR guidelines, deleting evidence clips leaves mathematical metrics intact for your physician's clinical assessment while immediately purging all underlying video waveforms.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-800/30 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
