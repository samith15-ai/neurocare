import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/authContext';

interface PatientEnrollmentPageProps {
  initialCode?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PatientEnrollmentPage: React.FC<PatientEnrollmentPageProps> = ({
  initialCode = '',
  onSuccess,
  onCancel,
}) => {
  const { login } = useAuth();
  const [code, setCode] = useState(initialCode);
  const [step, setStep] = useState<'validate' | 'consent' | 'register'>('validate');
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Consent fields
  const [consentFeatures, setConsentFeatures] = useState(true);
  const [consentClips, setConsentClips] = useState(false);
  const [consentResearch, setConsentResearch] = useState(false);
  const [signatureName, setSignatureName] = useState('');

  // Registration fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState('1965-06-15');
  const [gender, setGender] = useState('Female');
  const [submitting, setSubmitting] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  useEffect(() => {
    // Check url search params for ?code=
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlCode = urlParams.get('code');
      if (urlCode) {
        setCode(urlCode);
        validateCode(urlCode);
      } else if (initialCode) {
        validateCode(initialCode);
      }
    }
  }, [initialCode]);

  const validateCode = async (codeToValidate: string) => {
    if (!codeToValidate.trim()) {
      setValidationError('Please enter a valid invitation code');
      return;
    }
    setValidating(true);
    setValidationError(null);
    try {
      const inv = await api.getInvitation(codeToValidate.trim());
      if (inv.patient_email) {
        setEmail(inv.patient_email);
      }
      setStep('consent');
    } catch (err: any) {
      setValidationError(err.message || 'Invitation code not found or expired');
    } finally {
      setValidating(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentFeatures) {
      setRegError('Feature processing consent is required for contactless monitoring.');
      return;
    }
    if (!signatureName.trim()) {
      setRegError('Please provide your electronic signature acknowledgment.');
      return;
    }

    setSubmitting(true);
    setRegError(null);
    try {
      await api.registerWithInvite({
        invite_code: code.trim(),
        email,
        password,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: dob,
        gender,
        consent_version: 'v1.0',
        consent_features: consentFeatures,
        consent_evidence_clips: consentClips,
        consent_research: consentResearch,
        signature_name: signatureName.trim(),
      });

      // Login to application session
      await login(email, password);
      onSuccess();
    } catch (err: any) {
      setRegError(err.message || 'Failed to complete registration');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden">
        {/* Banner */}
        <div className="bg-gradient-to-r from-indigo-900/60 to-purple-900/60 border-b border-slate-800 p-6 text-center">
          <div className="inline-flex p-3 bg-indigo-500/20 text-indigo-400 rounded-2xl mb-2 text-2xl">
            🧠
          </div>
          <h2 className="text-xl font-bold text-white">NeuroCare Patient Enrollment</h2>
          <p className="text-xs text-slate-400 mt-1">
            Personalized Contactless Neurological Monitoring System
          </p>
        </div>

        <div className="p-6 md:p-8 space-y-6">
          {/* STEP 1: Enter / Validate Code */}
          {step === 'validate' && (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <h3 className="font-semibold text-white">Enter Your Invitation Code</h3>
                <p className="text-xs text-slate-400">
                  Provided by your attending physician or care team.
                </p>
              </div>

              {validationError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400">
                  {validationError}
                </div>
              )}

              <div className="space-y-3">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. INV-A1B2C3D4"
                  className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl px-4 py-3 text-center text-lg font-mono font-bold tracking-widest text-white uppercase focus:outline-none focus:border-indigo-500"
                />

                <div className="flex space-x-3">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-2xl text-xs font-semibold transition"
                  >
                    Back to Login
                  </button>
                  <button
                    type="button"
                    onClick={() => validateCode(code)}
                    disabled={validating || !code.trim()}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-semibold transition disabled:opacity-50"
                  >
                    {validating ? 'Verifying...' : 'Continue'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Informed Consent & Disclosure */}
          {step === 'consent' && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                  Step 1 of 2: Informed Consent (v1.0)
                </span>
                <h3 className="text-base font-bold text-white mt-1">
                  Transparent Privacy & Data Protection Disclosures
                </h3>
              </div>

              {/* Disclosure Accordions / Cards */}
              <div className="space-y-3 text-xs text-slate-300 max-h-60 overflow-y-auto pr-1">
                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                  <h4 className="font-semibold text-white mb-1">📹 What is Captured?</h4>
                  <p className="text-slate-400 leading-relaxed">
                    Short webcam video and microphone audio during active monitoring sessions (e.g. 10s finger tapping, sustained phonation). The camera measures optical motion landmarks; it does not perform biometric facial recognition.
                  </p>
                </div>

                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                  <h4 className="font-semibold text-white mb-1">💾 What is Stored?</h4>
                  <p className="text-slate-400 leading-relaxed">
                    Only mathematical and kinematic feature sets (tap cadence in Hz, amplitude ratio, pitch jitter %, reaction time). Video frames are processed in-memory and discarded immediately unless you explicitly opt in below.
                  </p>
                </div>

                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                  <h4 className="font-semibold text-white mb-1">🔒 Who Can Access It?</h4>
                  <p className="text-slate-400 leading-relaxed">
                    Your authenticated account and your authorized clinical care team. Data is never sold, shared with advertisers, or used for automated insurance denials.
                  </p>
                </div>

                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                  <h4 className="font-semibold text-white mb-1">🗑️ Retention & Deletion Policy</h4>
                  <p className="text-slate-400 leading-relaxed">
                    Features are retained for longitudinal baseline comparison. You have the right to revoke consent and permanently purge all stored data at any time via your account settings.
                  </p>
                </div>
              </div>

              {/* Granular Consent Checkboxes */}
              <div className="space-y-3 pt-2 border-t border-slate-800">
                <label className="flex items-start space-x-3 p-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentFeatures}
                    onChange={(e) => setConsentFeatures(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-white block">
                      Biomarker Extraction & Tracking (Required)
                    </span>
                    <span className="text-slate-400">
                      I consent to computer vision landmark and acoustic feature extraction for longitudinal neurological tracking.
                    </span>
                  </div>
                </label>

                <label className="flex items-start space-x-3 p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentClips}
                    onChange={(e) => setConsentClips(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-white block">
                      Evidence Video Clips (Optional)
                    </span>
                    <span className="text-slate-400">
                      Allow your physician to view short video clips of notable movement changes for clinical verification.
                    </span>
                  </div>
                </label>

                <label className="flex items-start space-x-3 p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentResearch}
                    onChange={(e) => setConsentResearch(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-white block">
                      De-Identified Research Contribution (Optional)
                    </span>
                    <span className="text-slate-400">
                      Contribute anonymous numerical features to help improve early-detection neurological algorithms.
                    </span>
                  </div>
                </label>
              </div>

              {/* Electronic Signature */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Electronic Signature (Type Your Full Legal Name)
                </label>
                <input
                  type="text"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  placeholder="e.g. Eleanor Rigby"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('validate')}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!signatureName.trim()) {
                      setValidationError('Please type your electronic signature name to proceed');
                      return;
                    }
                    setStep('register');
                  }}
                  disabled={!consentFeatures || !signatureName.trim()}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50"
                >
                  Confirm & Continue
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Complete Account Setup */}
          {step === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">
                  Step 2 of 2: Create Account
                </span>
                <h3 className="text-base font-bold text-white mt-1">
                  Patient Profile & Credentials
                </h3>
              </div>

              {regError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-400">
                  {regError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">First Name</label>
                  <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Last Name</label>
                  <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Date of Birth</label>
                  <input
                    type="date"
                    required
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Non-binary">Non-binary</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setStep('consent')}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {submitting ? (
                    <>
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Creating Account...</span>
                    </>
                  ) : (
                    <span>Complete Enrollment</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
