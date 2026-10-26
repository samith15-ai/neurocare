import React, { useState, useEffect } from 'react';
import {
  Bot,
  Send,
  ShieldAlert,
  Sparkles,
  FileText,
  CheckCircle,
  AlertTriangle,
  UserCheck,
  RefreshCw,
  PhoneCall,
} from 'lucide-react';
import { api } from '../../lib/api';
import type {
  AIChatResponse,
  ToolCallResult,
  ClinicianSummaryDraft,
  ClinicianSummary,
} from '../../types';

interface Message {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  roleMode?: 'patient' | 'doctor';
  toolCalls?: ToolCallResult[];
  emergencyAdvisory?: string | null;
  qualityNotes?: string | null;
  timestamp: string;
}

interface AIAssistantProps {
  patientId: string;
  assessmentId?: string;
  isDoctor?: boolean;
}

export const AIAssistant: React.FC<AIAssistantProps> = ({
  patientId,
  assessmentId,
  isDoctor = false,
}) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init',
      sender: 'assistant',
      text: isDoctor
        ? 'Clinical Decision Support Assistant active. All inquiries are grounded directly in stored kinematic sensor measurements and personal baselines without autonomous diagnostic inference.'
        : 'Hello! I am your NeuroCare monitoring assistant. I can help explain your movement and voice test results in simple terms.',
      roleMode: isDoctor ? 'doctor' : 'patient',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  // SOAP Summary Modal State (Doctor Mode)
  const [showSoapModal, setShowSoapModal] = useState(false);
  const [soapDraft, setSoapDraft] = useState<ClinicianSummaryDraft | null>(null);
  const [soapLoading, setSoapLoading] = useState(false);
  const [editSubjective, setEditSubjective] = useState('');
  const [editObjective, setEditObjective] = useState('');
  const [editAssessment, setEditAssessment] = useState('');
  const [editPlan, setEditPlan] = useState('');
  const [explicitApproval, setExplicitApproval] = useState(false);
  const [soapSaving, setSoapSaving] = useState(false);
  const [approvedSummaries, setApprovedSummaries] = useState<ClinicianSummary[]>([]);

  const patientPrompts = [
    'How is my finger tapping speed compared to baseline?',
    'Do I have Parkinson\'s disease?',
    'What do my recording quality checks show?',
    'How are my vocal and speech exercises doing?',
  ];

  const doctorPrompts = [
    'Summarize latest kinematic deviations and alert status.',
    'What is the motor baseline and MAD dispersion for finger tapping?',
    'Check latest assessment recording quality and noise metrics.',
    'What is the current longitudinal recovery index and CUSUM status?',
  ];

  const activePrompts = isDoctor ? doctorPrompts : patientPrompts;

  useEffect(() => {
    if (isDoctor && patientId) {
      loadApprovedSummaries();
    }
  }, [patientId, isDoctor]);

  const loadApprovedSummaries = async () => {
    try {
      const list = await api.getApprovedClinicianSummaries(patientId);
      setApprovedSummaries(list);
    } catch {
      // offline or unauthenticated
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || loading) return;

    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      sender: 'user',
      text: textToSend.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== 'init')
        .map((m) => ({
          role: m.sender === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.text,
        }));

      const res: AIChatResponse = await api.sendAIChat({
        patient_id: patientId,
        message: textToSend.trim(),
        conversation_history: history,
        assessment_id: assessmentId,
      });

      const assistantMsg: Message = {
        id: `asst-${Date.now()}`,
        sender: 'assistant',
        text: res.response,
        roleMode: res.role_adapted_mode,
        toolCalls: res.tool_calls,
        emergencyAdvisory: res.emergency_advisory,
        qualityNotes: res.quality_notes,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      const errMsg: Message = {
        id: `err-${Date.now()}`,
        sender: 'assistant',
        text: `Unable to complete query: ${err?.message || 'Server error'}. Please verify connection and authorized session.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSoapModal = async () => {
    setShowSoapModal(true);
    setSoapLoading(true);
    setExplicitApproval(false);
    try {
      const draft = await api.getClinicianSummaryDraft(patientId);
      setSoapDraft(draft);
      setEditSubjective(draft.subjective);
      setEditObjective(draft.objective);
      setEditAssessment(draft.assessment);
      setEditPlan(draft.plan);
    } catch (err: any) {
      alert(err?.message || 'Failed to generate draft clinician summary');
      setShowSoapModal(false);
    } finally {
      setSoapLoading(false);
    }
  };

  const handleApproveSoap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!explicitApproval) {
      alert('You must check the explicit approval confirmation before saving to the medical record.');
      return;
    }

    setSoapSaving(true);
    try {
      await api.approveClinicianSummary({
        patient_id: patientId,
        subjective: editSubjective,
        objective: editObjective,
        assessment: editAssessment,
        plan: editPlan,
        explicit_approval: true,
      });
      setShowSoapModal(false);
      await loadApprovedSummaries();
      alert('Clinical summary reviewed, approved, and saved to the patient medical record.');
    } catch (err: any) {
      alert(err?.message || 'Failed to approve clinician summary');
    } finally {
      setSoapSaving(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-950 text-indigo-400 p-2 rounded-xl border border-indigo-800/60">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-100">Grounded AI Monitoring Assistant</h3>
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <p className="text-xs text-slate-400">
              {isDoctor
                ? 'Clinical decision support strictly citing stored sensor kinematics and baseline MAD models'
                : 'Friendly, easy-to-understand explanations of your movement and speech test results'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-[10px] font-mono px-2.5 py-1 rounded-full border ${
              isDoctor
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-400'
                : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
            }`}
          >
            {isDoctor ? 'Clinician Mode' : 'Patient Mode'}
          </span>

          {isDoctor && (
            <button
              onClick={handleOpenSoapModal}
              className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Draft SOAP Note</span>
            </button>
          )}
        </div>
      </div>

      {/* Suggested Quick Prompts */}
      <div className="flex flex-wrap gap-2">
        {activePrompts.map((p, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => handleSendMessage(p)}
            className="text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg border border-slate-700 transition text-left"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Chat Messages Stream */}
      <div className="flex flex-col gap-3 max-h-96 overflow-y-auto pr-1">
        {messages.map((m) => {
          const isUser = m.sender === 'user';
          return (
            <div
              key={m.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} gap-1`}
            >
              {/* Emergency FAST banner if triggered */}
              {m.emergencyAdvisory && (
                <div className="max-w-xl bg-rose-950 border-2 border-rose-600 rounded-xl p-3 text-rose-100 flex items-start gap-2 text-xs mb-1 animate-pulse">
                  <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block text-rose-200">EMERGENCY PROTOCOL ADVISORY:</span>
                    <p className="mt-0.5 leading-relaxed">{m.emergencyAdvisory}</p>
                    <a
                      href="tel:911"
                      className="inline-flex items-center gap-1 mt-1.5 px-2.5 py-1 bg-rose-700 hover:bg-rose-600 rounded text-white font-bold text-[11px]"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>Call 911 Immediately</span>
                    </a>
                  </div>
                </div>
              )}

              {/* Message Bubble */}
              <div
                className={`max-w-xl rounded-2xl p-3.5 text-xs leading-relaxed ${
                  isUser
                    ? 'bg-sky-600 text-white rounded-br-none'
                    : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-none shadow-md'
                }`}
              >
                <div className="whitespace-pre-line">{m.text}</div>

                {/* Tool call provenance badges */}
                {m.toolCalls && m.toolCalls.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-slate-800 flex flex-wrap gap-1.5">
                    {m.toolCalls.map((tc, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 text-[10px] font-mono bg-slate-900 border border-slate-700/80 px-2 py-0.5 rounded text-slate-400"
                        title={tc.summary}
                      >
                        <CheckCircle className="w-2.5 h-2.5 text-teal-400" />
                        <span>{tc.tool_name}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <span className="text-[10px] text-slate-500 px-1">{m.timestamp}</span>
            </div>
          );
        })}

        {loading && (
          <div className="flex items-center gap-2 text-xs text-slate-400 p-2">
            <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
            <span>Consulting authorized clinical databases & sensor kinematics...</span>
          </div>
        )}
      </div>

      {/* Input Field */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendMessage();
        }}
        className="flex items-center gap-2 pt-2 border-t border-slate-800"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isDoctor
              ? 'Ask about kinematic parameters, baseline MAD, alert levels, or trends...'
              : 'Ask a question about your test results in plain words...'
          }
          className="flex-1 bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl px-4 py-2.5 outline-none focus:border-sky-500 transition"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white p-2.5 rounded-xl transition"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Previously Approved Clinical Summaries Section (Doctor View) */}
      {isDoctor && approvedSummaries.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-teal-400" />
              <span>Approved Clinical Summaries ({approvedSummaries.length})</span>
            </span>
          </div>

          <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
            {approvedSummaries.map((s) => (
              <div key={s.id} className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs">
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span className="font-semibold text-teal-300">Approved Medical Record Note</span>
                  <span>{s.approved_at ? new Date(s.approved_at).toLocaleDateString() : 'Approved'}</span>
                </div>
                <p className="text-[11px] text-slate-300 line-clamp-2">
                  <span className="font-bold text-slate-400">Assessment:</span> {s.assessment}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SOAP Clinical Summary Review & Approval Modal (Doctor View) */}
      {showSoapModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-2xl w-full shadow-2xl flex flex-col gap-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Clinician Review: SOAP Clinical Summary</h3>
                  <span className="text-[10px] text-slate-400">
                    Patient: {soapDraft?.patient_name} (MRN: {soapDraft?.mrn})
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowSoapModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            {/* Mandatory AI Draft Warning */}
            <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 flex items-start gap-2.5 text-amber-200 text-xs">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">AI-Generated Draft Notification</span>
                <span className="text-[11px] text-amber-300/90 leading-relaxed">
                  The AI assistant strictly generates a candidate draft. You must review, edit as necessary,
                  and explicitly approve this document before it becomes part of the patient&apos;s medical record.
                </span>
              </div>
            </div>

            {soapLoading ? (
              <div className="p-8 flex items-center justify-center text-slate-400 gap-2 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
                <span>Aggregating stored sensor kinematics, baselines, and check-ins...</span>
              </div>
            ) : (
              <form onSubmit={handleApproveSoap} className="flex flex-col gap-3">
                {/* Subjective */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Subjective (S) &mdash; Patient Self-Report & Check-ins
                  </label>
                  <textarea
                    value={editSubjective}
                    onChange={(e) => setEditSubjective(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl p-2.5 outline-none focus:border-sky-500"
                    required
                  />
                </div>

                {/* Objective */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Objective (O) &mdash; Stored Multimodal Sensor Kinematics
                  </label>
                  <textarea
                    value={editObjective}
                    onChange={(e) => setEditObjective(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl p-2.5 outline-none focus:border-sky-500 font-mono"
                    required
                  />
                </div>

                {/* Assessment */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Assessment (A) &mdash; Longitudinal Trajectory & Behavioral Interpretation
                  </label>
                  <textarea
                    value={editAssessment}
                    onChange={(e) => setEditAssessment(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl p-2.5 outline-none focus:border-sky-500"
                    required
                  />
                </div>

                {/* Plan */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Plan (P) &mdash; Monitoring Frequency & Clinical Follow-up
                  </label>
                  <textarea
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                    rows={2}
                    className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl p-2.5 outline-none focus:border-sky-500"
                    required
                  />
                </div>

                {/* Explicit Approval Checkbox */}
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="explicitApprove"
                    checked={explicitApproval}
                    onChange={(e) => setExplicitApproval(e.target.checked)}
                    className="mt-0.5 rounded text-sky-600 focus:ring-sky-500"
                    required
                  />
                  <label htmlFor="explicitApprove" className="text-xs text-slate-300 leading-snug cursor-pointer">
                    <span className="font-bold text-white block">Attending Clinician Approval Confirmation</span>
                    I confirm that I have reviewed, edited, and explicitly approved this clinical summary. I verify that
                    the statements accurately describe the patient&apos;s tele-monitoring observations.
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowSoapModal(false)}
                    className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={soapSaving || !explicitApproval}
                    className="px-4 py-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>{soapSaving ? 'Saving to Record...' : 'Approve & Save to Medical Record'}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
