import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Stethoscope, User, Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../lib/authContext';

export const LoginPage: React.FC = () => {
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'doctor' | 'patient'>('doctor');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isRegistering) {
        await register(email, password, fullName, role);
      } else {
        await login(email, password);
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Authentication error. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = async (demoRole: 'doctor' | 'patient') => {
    setError('');
    setLoading(true);
    try {
      if (demoRole === 'doctor') {
        await login('doctor@neurocare.org', 'Doctor123!');
      } else {
        await login('patient@neurocare.org', 'Patient123!');
      }
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Demo login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl flex flex-col gap-6">
        {/* Header */}
        <div className="text-center">
          <div className="inline-flex p-3 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 mb-3">
            <Activity className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-black text-slate-100">NeuroCare</h1>
          <p className="text-xs text-slate-400 mt-1">
            Contactless Multimodal Neurological Monitoring Platform
          </p>
        </div>

        {/* Demo Fast Login Buttons */}
        <div className="flex flex-col gap-2 p-3 bg-slate-950/60 border border-slate-800 rounded-2xl">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider text-center">
            One-Click Clinical Demo Access
          </span>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              type="button"
              onClick={() => handleDemoLogin('doctor')}
              disabled={loading}
              className="bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 text-sky-200 p-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <Stethoscope className="w-4 h-4 text-sky-400" />
              <span>Doctor Portal</span>
            </button>
            <button
              type="button"
              onClick={() => handleDemoLogin('patient')}
              disabled={loading}
              className="bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 p-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
            >
              <User className="w-4 h-4 text-emerald-400" />
              <span>Patient App</span>
            </button>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-950/40 border border-red-800/60 p-3 rounded-xl text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          {isRegistering && (
            <>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Dr. Jane Doe / John Doe"
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2.5 outline-none focus:border-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Account Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-3 py-2.5 outline-none focus:border-sky-500"
                >
                  <option value="doctor">Doctor (Clinician Dashboard)</option>
                  <option value="patient">Patient (Longitudinal Monitoring)</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="text-xs text-slate-400 block mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@neurocare.org"
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2.5 outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-9 pr-3 py-2.5 outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-xs sm:text-sm shadow-lg shadow-sky-950 transition flex items-center justify-center gap-2 mt-2"
          >
            <span>{isRegistering ? 'Create Account' : 'Sign In'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="text-center border-t border-slate-800/80 pt-3">
          <button
            type="button"
            onClick={() => setIsRegistering((r) => !r)}
            className="text-xs text-sky-400 hover:text-sky-300 underline font-medium"
          >
            {isRegistering ? 'Already have an account? Sign In' : 'Need an account? Register here'}
          </button>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
          <span>HIPAA & Medaithon MED-PS-002 Compliance Guardrails Active</span>
        </div>
      </div>
    </div>
  );
};
