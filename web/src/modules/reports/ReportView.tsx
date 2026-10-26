import React, { useState } from 'react';
import {
  FileText,
  Share2,
  Download,
  ShieldCheck,
  AlertTriangle,
  Printer,
  Eye,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Info,
  X,
  Activity,
  Layers
} from 'lucide-react';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import { fileHandlingService, sharingService } from '../../platform';
import { api } from '../../lib/api';
import type { Report, Patient, Finding } from '../../types';

interface ReportViewProps {
  report: Report;
  patient?: Patient;
  canApprove?: boolean;
  onApproved?: (updated: Report) => void;
}

interface EvidenceModalData {
  title: string;
  domain: string;
  explanation: string;
  metrics: Record<string, any>;
  quality?: string;
  sourceNotice?: string;
}

export const ReportView: React.FC<ReportViewProps> = ({
  report,
  patient,
  canApprove = false,
  onApproved,
}) => {
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceModalData | null>(null);
  const [feedbackChoice, setFeedbackChoice] = useState<'agree' | 'disagree' | 'unsure'>(
    (report.doctor_feedback as any) || 'agree'
  );
  const [doctorNotes, setDoctorNotes] = useState<string>(report.doctor_notes || '');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);

  // Parse domain scores
  let domainScores: Record<string, number | null> = {
    motor: null,
    speech: null,
    facial: null,
    gait: null,
    balance: null,
    cognition: null,
  };
  if (report.domain_scores_json) {
    try {
      domainScores = { ...domainScores, ...JSON.parse(report.domain_scores_json) };
    } catch {}
  }

  // Handle Share
  const handleShare = async () => {
    await sharingService.shareReport(
      `NeuroCare Report - Assessment ${report.assessment_id.slice(0, 8)}`,
      report.summary_text
    );
  };

  // Handle Text Download
  const handleDownloadText = async () => {
    const content =
      `NEUROCARE CLINICAL MONITORING REPORT\n` +
      `====================================\n\n` +
      `Patient: ${patient ? `${patient.first_name} ${patient.last_name} (MRN: ${patient.mrn})` : report.patient_id}\n` +
      `Assessment ID: ${report.assessment_id}\n` +
      `Date: ${new Date(report.created_at).toLocaleString()}\n` +
      `Overall Monitoring Status: ${report.overall_status || 'No flag'}\n` +
      `Late Fusion Deviation Index: ${report.late_fusion_score !== null ? report.late_fusion_score.toFixed(2) : 'N/A'}\n\n` +
      `Domain Scores:\n` +
      `- Motor: ${domainScores.motor !== null ? domainScores.motor.toFixed(2) : 'Unassessed'}\n` +
      `- Speech: ${domainScores.speech !== null ? domainScores.speech.toFixed(2) : 'Unassessed'}\n` +
      `- Facial Movement: ${domainScores.facial !== null ? domainScores.facial.toFixed(2) : 'Unassessed'}\n` +
      `- Gait (Placeholder): ${domainScores.gait !== null ? domainScores.gait : 'Unassessed'}\n` +
      `- Balance (Placeholder): ${domainScores.balance !== null ? domainScores.balance : 'Unassessed'}\n` +
      `- Cognition (Placeholder): ${domainScores.cognition !== null ? domainScores.cognition : 'Unassessed'}\n\n` +
      `Summary:\n${report.summary_text}\n\n` +
      `Doctor Review:\n` +
      `Feedback: ${report.doctor_feedback || 'Pending review'}\n` +
      `Notes: ${report.doctor_notes || 'None'}\n\n` +
      `------------------------------------\n` +
      `MEDICAL SAFETY NOTICE:\n` +
      `NeuroCare is a decision-support and longitudinal monitoring tool. Statuses represent monitoring alerts, not clinical diagnoses.`;

    await fileHandlingService.saveReport(`NeuroCare_Report_${report.assessment_id.slice(0, 8)}.txt`, content);
  };

  // Handle Print / PDF One-Page Report
  const handlePrint = () => {
    window.print();
  };

  // Handle Doctor Review Submission
  const handleSubmitReview = async () => {
    setSubmittingReview(true);
    setReviewMessage(null);
    try {
      const updated = await api.submitDoctorReview(
        report.id,
        feedbackChoice,
        doctorNotes,
        report.approved_by_user_id || undefined
      );
      setReviewMessage('Doctor review saved successfully.');
      if (onApproved) {
        onApproved(updated);
      }
    } catch (e: any) {
      setReviewMessage(e.message || 'Failed to submit review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'Review advised':
        return {
          bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
          dot: 'bg-rose-500',
          label: 'Review advised',
          desc: 'Notable behavioral deviation or pattern identified. Clinician review advised.',
        };
      case 'Watch':
        return {
          bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
          dot: 'bg-amber-500',
          label: 'Watch',
          desc: 'Observed mild variation from baseline. Routine monitoring recommended.',
        };
      default:
        return {
          bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
          dot: 'bg-emerald-500',
          label: 'No flag',
          desc: 'Measurements nominal and within baseline variance.',
        };
    }
  };

  const statusBadge = getStatusBadge(report.overall_status);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-6 print:bg-white print:text-black print:border-none print:shadow-none print:p-0">
      {/* Action Bar (Hidden on print) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4 print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-slate-100">
              Neurological Monitoring Evaluation Report
            </h2>
            {report.is_simulated && <SimulatedBadge />}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Ref: {report.assessment_id} • Created {new Date(report.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition"
            title="Print or Save as 1-Page PDF"
          >
            <Printer className="w-4 h-4" />
            Print / PDF
          </button>
          <button
            onClick={handleShare}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition"
            title="Share report summary"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownloadText}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition"
            title="Download report text"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Printable Report Header (Optimized for 1-Page PDF) */}
      <div className="hidden print:block border-b-2 border-slate-800 pb-3 mb-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">NEUROCARE</h1>
            <p className="text-xs text-slate-600 font-medium">
              Multimodal Contactless Neurological Behavioral Monitoring
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs font-bold px-2.5 py-1 rounded border border-slate-400">
              {report.overall_status?.toUpperCase() || 'NO FLAG'}
            </span>
            <p className="text-[10px] text-slate-500 mt-1">
              Assessment Date: {new Date(report.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Patient Demographic Summary */}
        <div className="grid grid-cols-4 gap-2 mt-3 p-2.5 bg-slate-100 rounded-lg text-xs">
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Patient Name</span>
            <strong className="text-slate-900">
              {patient ? `${patient.first_name} ${patient.last_name}` : 'Not Specified'}
            </strong>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">MRN</span>
            <span className="font-mono text-slate-800">{patient?.mrn || 'N/A'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Gender / DOB</span>
            <span className="text-slate-800">{patient?.gender || 'N/A'} • {patient?.date_of_birth || 'N/A'}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase block font-semibold">Evaluation Mode</span>
            <span className="text-slate-800">Contactless Multimodal</span>
          </div>
        </div>

        {report.is_simulated && (
          <div className="mt-2 text-[10px] bg-amber-100 text-amber-900 p-1.5 rounded border border-amber-300 font-medium">
            SIMULATED DATA BANNER: This assessment contains synthetic or recorded test data.
          </div>
        )}
      </div>

      {/* Emergency Alert Banner if triggered */}
      {report.emergency_fast_triggered && (
        <div className="bg-red-950/40 border border-red-700/60 p-4 rounded-2xl flex items-center gap-3 text-red-200 text-xs">
          <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0" />
          <div>
            <strong className="block text-red-100 font-bold uppercase text-sm">
              EMERGENCY FAST PROTOCOL TRIGGERED
            </strong>
            <p className="mt-0.5 text-red-200">
              {report.emergency_details || 'Severe acute unilateral facial or speech deviation detected. Immediate clinical assessment recommended.'}
            </p>
          </div>
        </div>
      )}

      {/* Overall Status Banner & Key Score */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Overall Monitoring Status */}
        <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between print:border-slate-300 print:bg-slate-50">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 print:text-slate-600 block mb-1">
              Overall Monitoring Status
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusBadge.bg}`}>
                <span className={`w-2 h-2 rounded-full ${statusBadge.dot}`} />
                {statusBadge.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 print:text-slate-700 mt-2 leading-relaxed">
              {statusBadge.desc}
            </p>
          </div>
          <span className="text-[10px] text-slate-500 print:text-slate-600 mt-2 italic block border-t border-slate-800/80 pt-2 print:border-slate-300">
            * Monitoring status only — not a clinical diagnosis.
          </span>
        </div>

        {/* Composite Deviation Score */}
        <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between print:border-slate-300 print:bg-slate-50">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 print:text-slate-600 block mb-1">
              Composite Deviation Score
            </span>
            <div className="text-3xl font-black text-sky-400 print:text-sky-700 mt-1">
              {report.late_fusion_score !== null ? report.late_fusion_score.toFixed(2) : 'N/A'}
            </div>
            <span className="text-xs text-slate-400 print:text-slate-600 mt-1 block">
              Interpretable weighted multimodal index
            </span>
          </div>
          <div className="text-[10px] text-slate-500 print:text-slate-600 mt-2 border-t border-slate-800/80 pt-2 print:border-slate-300">
            Reference scale: &lt;1.0 Nominal | 1.0–2.0 Watch | &gt;2.0 Review Advised
          </div>
        </div>

        {/* Clinician Review Badge */}
        <div className="bg-slate-950/70 border border-slate-800 p-4 rounded-2xl flex flex-col justify-between print:border-slate-300 print:bg-slate-50">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 print:text-slate-600 block mb-1">
              Physician Review Consensus
            </span>
            <div className="mt-1">
              {report.doctor_feedback ? (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                  report.doctor_feedback === 'agree'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : report.doctor_feedback === 'disagree'
                    ? 'bg-slate-700 text-slate-300 border-slate-600'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}>
                  {report.doctor_feedback === 'agree' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                  {report.doctor_feedback === 'disagree' && <XCircle className="w-3.5 h-3.5 text-slate-400" />}
                  {report.doctor_feedback === 'unsure' && <HelpCircle className="w-3.5 h-3.5 text-amber-400" />}
                  Physician Feedback: {report.doctor_feedback.toUpperCase()}
                </span>
              ) : (
                <span className="text-xs bg-slate-800 text-slate-400 border border-slate-700 px-2.5 py-1 rounded-full font-medium">
                  Awaiting Clinician Feedback
                </span>
              )}
            </div>
            {report.doctor_notes && (
              <p className="text-xs text-slate-300 print:text-slate-800 mt-2 bg-slate-900/60 p-2 rounded-lg border border-slate-800 print:bg-slate-100 print:border-slate-300">
                &ldquo;{report.doctor_notes}&rdquo;
              </p>
            )}
          </div>
          <span className="text-[10px] text-slate-500 print:text-slate-600 mt-2 border-t border-slate-800/80 pt-2 print:border-slate-300">
            {report.approved_by_doctor ? 'Reviewed & Concurred' : 'Unsigned Decision Support Report'}
          </span>
        </div>
      </div>

      {/* Domain Scores Visualization */}
      <div className="bg-slate-950/50 border border-slate-800/80 p-5 rounded-2xl print:border-slate-300 print:bg-white">
        <h3 className="text-xs font-bold text-slate-200 print:text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4 text-sky-400" />
          Multimodal Domain Breakdown
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { key: 'motor', label: 'Motor (Tapping)', val: domainScores.motor, active: true },
            { key: 'speech', label: 'Speech & Voice', val: domainScores.speech, active: true },
            { key: 'facial', label: 'Facial Motion', val: domainScores.facial, active: true },
            { key: 'gait', label: 'Gait (Ambulation)', val: domainScores.gait, active: true },
            { key: 'balance', label: 'Balance (Stance)', val: domainScores.balance, active: true },
            { key: 'cognition', label: 'Cognition', val: domainScores.cognition, active: true },
          ].map((item) => {
            const hasVal = item.val !== null && item.val !== undefined;
            const deviation: number = (hasVal && typeof item.val === 'number') ? item.val : 0;
            const barWidth = Math.min(100, (deviation / 3.0) * 100);

            return (
              <div
                key={item.key}
                className={`p-3 rounded-xl border flex flex-col justify-between ${
                  hasVal
                    ? 'bg-slate-900/80 border-slate-700/80 print:bg-slate-50 print:border-slate-300'
                    : 'bg-slate-900/30 border-slate-800/50 opacity-60 print:bg-slate-50 print:border-slate-200'
                }`}
              >
                <div>
                  <span className="text-[10px] font-bold text-slate-400 print:text-slate-600 uppercase block truncate">
                    {item.label}
                  </span>
                  <div className="text-lg font-black text-slate-100 print:text-slate-900 mt-1">
                    {hasVal ? item.val?.toFixed(2) : 'Unassessed'}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden print:bg-slate-200">
                    {hasVal && (
                      <div
                        className={`h-full rounded-full ${
                          deviation > 2.0
                            ? 'bg-rose-500'
                            : deviation > 1.0
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        }`}
                        style={{ width: `${barWidth}%` }}
                      />
                    )}
                  </div>
                  <span className="text-[9px] text-slate-500 print:text-slate-600 mt-1 block">
                    {hasVal
                      ? deviation > 2.0
                        ? 'High Deviation'
                        : deviation > 1.0
                        ? 'Moderate'
                        : 'Nominal'
                      : 'Missing ≠ Abnormal'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Explainable Findings Table */}
      <div className="bg-slate-950/50 border border-slate-800/80 rounded-2xl overflow-hidden print:border-slate-300 print:bg-white">
        <div className="p-4 border-b border-slate-800/80 print:border-slate-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-bold text-slate-200 print:text-slate-900 uppercase tracking-wider">
              Evidence-Linked Behavioral Findings
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 print:text-slate-600">
            {report.findings?.length || 0} Rule-Based Finding(s)
          </span>
        </div>

        {report.findings && report.findings.length > 0 ? (
          <div className="divide-y divide-slate-800/60 print:divide-slate-200">
            {report.findings.map((f: Finding) => {
              let metrics: any = {};
              try {
                metrics = JSON.parse(f.evidence_metrics);
              } catch {}

              return (
                <div
                  key={f.id}
                  className="p-4 hover:bg-slate-900/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 print:p-2.5"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-sky-300 border border-slate-700 print:bg-slate-200 print:text-slate-800">
                        {f.domain}
                      </span>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-100 print:text-slate-900">
                        {f.finding_title}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-300 print:text-slate-700 leading-relaxed">
                      {f.explanation}
                    </p>
                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400 print:text-slate-600">
                      <span>Relevance: <strong>{f.clinical_relevance}</strong></span>
                      {metrics.rule_id && (
                        <span className="font-mono text-[10px] text-slate-500 print:text-slate-600">
                          ID: {metrics.rule_id}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0 print:hidden">
                    <button
                      onClick={() =>
                        setSelectedEvidence({
                          title: f.finding_title,
                          domain: f.domain,
                          explanation: f.explanation,
                          metrics,
                          quality: metrics.quality || 'valid',
                          sourceNotice: 'Config-driven rule evaluated against versioned prototype references.',
                        })
                      }
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Eye className="w-3.5 h-3.5 text-sky-400" />
                      Inspect Evidence
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 text-center text-xs text-slate-400 print:text-slate-600">
            No behavioral pattern deviations flagged. All measured features remain within reference boundaries.
          </div>
        )}
      </div>

      {/* Narrative Summary */}
      <div className="bg-slate-950/50 border border-slate-800/80 p-4 rounded-2xl print:border-slate-300 print:bg-white">
        <h4 className="text-xs font-bold text-slate-300 print:text-slate-900 uppercase tracking-wider mb-2">
          Clinical Summary & Traceability
        </h4>
        <p className="text-xs text-slate-300 print:text-slate-800 leading-relaxed">
          {report.summary_text}
        </p>
      </div>

      {/* Clinician Review & Feedback Controls (Interactive for Doctors) */}
      {canApprove && (
        <div className="bg-slate-950/70 border border-sky-900/40 p-5 rounded-2xl flex flex-col gap-4 print:hidden">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-sky-400" />
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider">
                Clinician Verification & Clinical Notes
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">
              Required for diagnostic review log
            </span>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            {[
              {
                id: 'agree',
                label: 'Agree with Findings',
                icon: CheckCircle2,
                color: 'text-emerald-400',
                activeBg: 'bg-emerald-950/50 border-emerald-500/60 text-emerald-200',
              },
              {
                id: 'unsure',
                label: 'Unsure / Re-test Advised',
                icon: HelpCircle,
                color: 'text-amber-400',
                activeBg: 'bg-amber-950/50 border-amber-500/60 text-amber-200',
              },
              {
                id: 'disagree',
                label: 'Disagree / Artifact',
                icon: XCircle,
                color: 'text-rose-400',
                activeBg: 'bg-rose-950/50 border-rose-500/60 text-rose-200',
              },
            ].map((option) => {
              const Icon = option.icon;
              const isSelected = feedbackChoice === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setFeedbackChoice(option.id as any)}
                  className={`flex-1 p-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition ${
                    isSelected
                      ? option.activeBg
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${option.color}`} />
                  {option.label}
                </button>
              );
            })}
          </div>

          <div>
            <label className="text-[11px] font-semibold text-slate-300 block mb-1">
              Physician Clinical Notes & Observations
            </label>
            <textarea
              value={doctorNotes}
              onChange={(e) => setDoctorNotes(e.target.value)}
              placeholder="e.g. Findings correspond with clinical bradykinesia; patient reported mild hand stiffness earlier today..."
              rows={3}
              className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
            />
          </div>

          <div className="flex items-center justify-between pt-1">
            {reviewMessage && (
              <span className="text-xs text-sky-400 font-medium">{reviewMessage}</span>
            )}
            <div className="ml-auto">
              <button
                type="button"
                onClick={handleSubmitReview}
                disabled={submittingReview}
                className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-lg transition"
              >
                {submittingReview ? 'Submitting...' : 'Save Physician Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Doctor Signature & Footer */}
      <div className="hidden print:block mt-4 border-t-2 border-slate-800 pt-3 text-xs text-slate-800">
        <div className="flex justify-between items-end">
          <div>
            <p className="font-semibold text-[11px]">Examining Clinician Decision Log:</p>
            <p className="text-[10px] text-slate-600 mt-0.5">
              Feedback: <strong>{report.doctor_feedback?.toUpperCase() || 'UNREVIEWED'}</strong>
            </p>
            {report.doctor_notes && (
              <p className="text-[10px] text-slate-700 italic mt-0.5">
                Notes: &ldquo;{report.doctor_notes}&rdquo;
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="border-b border-slate-400 w-48 mb-1" />
            <p className="text-[10px] text-slate-500">Physician Signature & Date</p>
          </div>
        </div>

        <div className="mt-3 text-[9px] text-slate-500 border-t border-slate-300 pt-1 text-center">
          MEDICAL SAFETY ADVISORY: NeuroCare is an assistive behavioral monitoring software system.
          It does not diagnose medical conditions or calculate autonomous disease likelihoods.
          All findings must be evaluated by a certified physician in conjunction with complete clinical history.
        </div>
      </div>

      {/* Interactive Evidence Viewer Modal */}
      {selectedEvidence && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:hidden">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-sky-400" />
                <h3 className="text-sm font-bold text-slate-100">Interactive Evidence Trace</h3>
              </div>
              <button
                onClick={() => setSelectedEvidence(null)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-sky-400 tracking-wider">
                {selectedEvidence.domain} Domain Finding
              </span>
              <h4 className="text-base font-bold text-slate-100 mt-0.5">
                {selectedEvidence.title}
              </h4>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {selectedEvidence.explanation}
              </p>
            </div>

            {/* Metrics Breakdown Table */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                Triggering Biomarkers & Reference Norms
              </span>

              {selectedEvidence.metrics.actual_values && (
                <div className="divide-y divide-slate-800 text-xs">
                  {Object.keys(selectedEvidence.metrics.actual_values).map((key) => {
                    const actual = selectedEvidence.metrics.actual_values[key];
                    const ref = selectedEvidence.metrics.reference_values?.[key];
                    return (
                      <div key={key} className="py-2 flex justify-between items-center">
                        <span className="font-mono text-[11px] text-slate-300">{key}</span>
                        <div className="text-right">
                          <span className="font-bold text-slate-100">
                            {typeof actual === 'number' ? actual.toFixed(3) : actual}
                          </span>
                          {ref !== undefined && ref !== null && (
                            <span className="text-[10px] text-slate-400 ml-2">
                              (Ref Mean: {typeof ref === 'number' ? ref.toFixed(2) : ref})
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quality & Traceability Notice */}
            <div className="bg-slate-950/40 border border-slate-800/80 p-3 rounded-xl text-[11px] text-slate-400 flex flex-col gap-1">
              <div>
                Recording Quality: <strong className="text-emerald-400 uppercase">{selectedEvidence.quality || 'Valid'}</strong>
              </div>
              <p className="italic text-[10px] text-slate-500">
                Rule: Quality is not pathology. Unavailable beats invented.
                Reference ranges derived from versioned prototype norms.
              </p>
            </div>

            <button
              onClick={() => setSelectedEvidence(null)}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs py-2.5 rounded-xl border border-slate-700 transition"
            >
              Close Evidence Trace
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
