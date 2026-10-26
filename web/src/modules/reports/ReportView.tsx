import React, { useState } from 'react';
import { FileText, CheckCircle, Share2, Download, ShieldCheck, AlertTriangle } from 'lucide-react';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import { fileHandlingService, sharingService } from '../../platform';
import { api } from '../../lib/api';
import type { Report } from '../../types';

interface ReportViewProps {
  report: Report;
  canApprove?: boolean;
  onApproved?: (updated: Report) => void;
}

export const ReportView: React.FC<ReportViewProps> = ({ report, canApprove = false, onApproved }) => {
  const [approving, setApproving] = useState(false);

  const handleShare = async () => {
    await sharingService.shareReport(
      `NeuroCare Report - Assessment ${report.assessment_id.slice(0, 8)}`,
      report.summary_text
    );
  };

  const handleDownload = async () => {
    const content = `NEUROCARE CLINICAL MONITORING REPORT\n\n` +
      `Assessment ID: ${report.assessment_id}\n` +
      `Generated: ${new Date(report.created_at).toLocaleString()}\n` +
      `Late Fusion Score: ${report.late_fusion_score ?? 'N/A'}\n` +
      `Status: ${report.emergency_fast_triggered ? 'CRITICAL FAST TRIGGERED' : 'Nominal Monitoring'}\n\n` +
      `Summary:\n${report.summary_text}\n\n` +
      `Explainability Notes:\n${report.explainability_notes ?? 'None'}\n\n` +
      `Doctor Approved: ${report.approved_by_doctor ? 'YES' : 'PENDING'}\n\n` +
      `---\nNotice: This report provides algorithmic decision-support and does not represent an autonomous diagnostic determination.`;

    await fileHandlingService.saveReport(`NeuroCare_Report_${report.assessment_id.slice(0, 8)}.txt`, content);
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      const updated = await api.approveReport(report.id);
      if (onApproved) onApproved(updated);
    } catch (e) {
      console.error('Approval failed', e);
    } finally {
      setApproving(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl flex flex-col gap-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-400" />
            <h2 className="text-base font-bold text-slate-100">Neurological Monitoring Evaluation Report</h2>
            {report.is_simulated && <SimulatedBadge />}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Ref: {report.assessment_id} • Created {new Date(report.created_at).toLocaleString()}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleShare}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
            title="Share report"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
            title="Download report"
          >
            <Download className="w-4 h-4" />
          </button>
          {canApprove && !report.approved_by_doctor && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-semibold text-xs px-3.5 py-2 rounded-lg flex items-center gap-1.5 shadow transition"
            >
              <CheckCircle className="w-4 h-4" />
              Approve Report
            </button>
          )}
        </div>
      </div>

      {/* Emergency Alert Banner if triggered */}
      {report.emergency_fast_triggered && (
        <div className="bg-red-950/40 border border-red-700/60 p-3 rounded-xl flex items-center gap-3 text-red-200 text-xs">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <div>
            <strong className="block text-red-100 font-bold uppercase">Emergency FAST Criteria Triggered</strong>
            {report.emergency_details || 'Acute unilateral behavioral asymmetry detected.'}
          </div>
        </div>
      )}

      {/* Scores & Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block mb-1">
            Late Fusion Index
          </span>
          <div className="text-2xl font-black text-sky-400">
            {report.late_fusion_score !== null ? report.late_fusion_score.toFixed(2) : 'N/A'}
          </div>
          <span className="text-[11px] text-slate-500">Aggregate multimodal deviation</span>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block mb-1">
            Clinical Determination Status
          </span>
          <div className="text-sm font-bold text-slate-200 mt-1">
            {report.late_fusion_score && report.late_fusion_score > 2.0
              ? 'Observed change - May warrant clinical review'
              : 'Nominal / Stable baseline'}
          </div>
          <span className="text-[11px] text-slate-500">Non-diagnostic algorithmic scoring</span>
        </div>

        <div className="bg-slate-950/70 border border-slate-800 p-3.5 rounded-xl">
          <span className="text-[11px] text-slate-400 font-medium uppercase tracking-wider block mb-1">
            Clinician Review Status
          </span>
          <div className="flex items-center gap-1.5 mt-1">
            {report.approved_by_doctor ? (
              <span className="text-xs bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Clinician Approved
              </span>
            ) : (
              <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-bold">
                Pending Clinician Review
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Summary Narrative */}
      <div className="bg-slate-950/50 border border-slate-800/80 p-4 rounded-xl">
        <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Narrative Summary</h4>
        <p className="text-xs text-slate-300 leading-relaxed">{report.summary_text}</p>
        {report.explainability_notes && (
          <p className="text-[11px] text-slate-500 mt-2 italic border-t border-slate-800/60 pt-2">
            Explainability: {report.explainability_notes}
          </p>
        )}
      </div>
    </div>
  );
};
