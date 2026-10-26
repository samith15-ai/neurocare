import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Clock,
  PlusCircle,
  Trash2,
  CheckCircle,
  ShieldAlert,
  Calendar,
  Sparkles,
  Info,
  RefreshCw,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { api } from '../../lib/api';
import type {
  LongitudinalIntelligenceReport,
  TreatmentEventCreate,
  TimelineState,
  AlertLevel,
} from '../../types';

interface LongitudinalTimelineViewProps {
  patientId: string;
  isDoctor?: boolean;
}

const TIMELINE_STATES: { key: TimelineState; label: string; description: string }[] = [
  { key: 'baseline', label: 'Baseline', description: 'Establishing nominal behavioral range' },
  { key: 'onset', label: 'Onset', description: 'Initial deviation detected by CUSUM' },
  { key: 'active_change', label: 'Active Change', description: 'Confirmed persistent deviation' },
  { key: 'recovering', label: 'Recovering', description: 'Trajectory trending toward baseline' },
  { key: 'recovered_or_stable', label: 'Recovered / Stable', description: 'Within nominal baseline band' },
  { key: 'relapse_watch', label: 'Relapse Watch', description: 'Post-recovery surveillance active' },
];

export const LongitudinalTimelineView: React.FC<LongitudinalTimelineViewProps> = ({
  patientId,
  isDoctor = false,
}) => {
  const [data, setData] = useState<LongitudinalIntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeDomainFilter, setActiveDomainFilter] = useState<string>('all');
  const [showEventModal, setShowEventModal] = useState(false);

  // Event modal form
  const [eventType, setEventType] = useState('medication_change');
  const [eventDate, setEventDate] = useState(new Date().toISOString().split('T')[0]);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false);

  useEffect(() => {
    loadData();
  }, [patientId]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const rep = await api.getLongitudinalAnalysis(patientId);
      setData(rep);
    } catch (err: any) {
      setError(err?.message || 'Failed to load longitudinal intelligence analysis');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim()) return;

    setIsSubmittingEvent(true);
    try {
      const payload: TreatmentEventCreate = {
        patient_id: patientId,
        event_type: eventType,
        event_date: eventDate,
        title: eventTitle.trim(),
        description: eventDescription.trim() || undefined,
      };
      await api.createTreatmentEvent(payload);
      setShowEventModal(false);
      setEventTitle('');
      setEventDescription('');
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to record treatment event');
    } finally {
      setIsSubmittingEvent(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Are you sure you want to remove this treatment event?')) return;
    try {
      await api.deleteTreatmentEvent(eventId);
      await loadData();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete treatment event');
    }
  };

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex flex-col items-center justify-center text-slate-400 gap-3">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-400" />
        <span className="text-sm">Evaluating longitudinal trajectory & change detection...</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-slate-300">
        <div className="flex items-center gap-2 text-rose-400 mb-2 font-bold text-sm">
          <AlertTriangle className="w-4 h-4" />
          <span>Longitudinal Intelligence Unavailable</span>
        </div>
        <p className="text-xs text-slate-400 mb-4">{error || 'No trajectory data available yet.'}</p>
        <button
          onClick={loadData}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg transition"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Filter profiles
  const domains = Array.from(new Set(data.change_profiles.map((p) => p.domain)));
  const filteredProfiles =
    activeDomainFilter === 'all'
      ? data.change_profiles
      : data.change_profiles.filter((p) => p.domain === activeDomainFilter);

  // State styling helper
  const getTimelineStateBadge = (state: TimelineState) => {
    switch (state) {
      case 'baseline':
        return { bg: 'bg-sky-500/15 border-sky-500/40 text-sky-400', label: 'Baseline Establishing' };
      case 'onset':
        return { bg: 'bg-amber-500/15 border-amber-500/40 text-amber-400', label: 'Empirical Onset' };
      case 'active_change':
        return { bg: 'bg-rose-500/15 border-rose-500/40 text-rose-400', label: 'Active Change' };
      case 'recovering':
        return { bg: 'bg-teal-500/15 border-teal-500/40 text-teal-400', label: 'Recovering Trajectory' };
      case 'recovered_or_stable':
        return { bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400', label: 'Recovered / Stable' };
      case 'relapse_watch':
        return { bg: 'bg-orange-500/15 border-orange-500/40 text-orange-400', label: 'Relapse Watch' };
      default:
        return { bg: 'bg-slate-800 border-slate-700 text-slate-300', label: state };
    }
  };

  const getAlertBadge = (alert: AlertLevel) => {
    switch (alert) {
      case 'stable':
        return { bg: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', label: 'Stable Variance' };
      case 'watch':
        return { bg: 'bg-amber-500/15 text-amber-400 border-amber-500/30', label: 'Watch Advised' };
      case 'review_advised':
        return { bg: 'bg-rose-500/15 text-rose-400 border-rose-500/30', label: 'Clinical Review Advised' };
    }
  };

  const stateBadge = getTimelineStateBadge(data.timeline_state);
  const alertBadge = getAlertBadge(data.overall_alert);

  return (
    <div className="flex flex-col gap-6">
      {/* 1. Header & Emergency FAST Priority Banner */}
      {data.emergency_fast_triggered && (
        <div className="bg-rose-950/80 border-2 border-rose-600 rounded-2xl p-4 shadow-xl text-rose-100 flex items-start gap-3.5 animate-pulse">
          <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm tracking-wide text-rose-200">
                CRITICAL ALERT: EMERGENCY FAST PROTOCOL TRIGGERED
              </span>
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 bg-rose-900 border border-rose-500 rounded text-rose-200 font-bold">
                Priority Override
              </span>
            </div>
            <p className="text-xs text-rose-300 mt-1">
              Sudden severe facial asymmetry or vocal breakdown detected. Clinical emergency FAST protocol takes absolute
              precedence over longitudinal change models. Recommend immediate in-person evaluation.
            </p>
          </div>
        </div>
      )}

      {/* Top Banner Card: Timeline State & Alert Level */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-slate-100">Longitudinal Change Intelligence</h3>
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${stateBadge.bg}`}>
                {stateBadge.label}
              </span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${alertBadge.bg}`}>
                {alertBadge.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1.5 max-w-2xl">{data.timeline_explanation}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowEventModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold transition"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Log Treatment Event</span>
            </button>
            <button
              onClick={loadData}
              title="Refresh intelligence"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Timeline Progression Ribbon */}
        <div className="mt-5">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2.5">
            Behavioral Trajectory Lifecycle
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {TIMELINE_STATES.map((st, idx) => {
              const isActive = data.timeline_state === st.key;
              return (
                <div
                  key={st.key}
                  className={`relative p-2.5 rounded-xl border text-left transition-all ${
                    isActive
                      ? 'bg-sky-950/40 border-sky-500 text-sky-100 ring-1 ring-sky-500/30'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono text-slate-500">0{idx + 1}</span>
                    {isActive && <CheckCircle className="w-3.5 h-3.5 text-sky-400" />}
                  </div>
                  <div className="text-xs font-bold truncate">{st.label}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-2 leading-tight">
                    {st.description}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 2. Experimental Recovery Tracking Widget */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-teal-400" />
              <h4 className="text-sm font-bold text-slate-100">Behavioral Recovery Tracking</h4>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 font-mono font-semibold">
                EXPERIMENTAL
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Quantifies return toward personalized baseline relative to peak observed deviation.
            </p>
          </div>

          <div className="text-right">
            <span className="text-2xl font-black text-teal-400 font-mono">
              {data.recovery.overall_recovery_index.toFixed(1)}%
            </span>
            <span className="text-[10px] text-slate-400 block">
              Uncertainty: &plusmn;{data.recovery.uncertainty_pct.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Prominent Experimental Disclaimer */}
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex items-start gap-2.5 text-slate-400">
          <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed text-slate-300">
            {data.recovery.experimental_disclaimer}
          </p>
        </div>

        {/* Plateau Detection Alert */}
        {data.recovery.plateau_detected && (
          <div className="bg-amber-950/40 border border-amber-500/40 rounded-xl p-3 flex items-start gap-2.5 text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-bold block">Trajectory Plateau Detected</span>
              <span className="text-xs text-amber-300/90">{data.recovery.plateau_note}</span>
            </div>
          </div>
        )}

        {/* Recovery Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
              Peak Deviation (|Z|)
            </span>
            <span className="text-lg font-bold text-slate-200 font-mono mt-0.5 block">
              {data.recovery.peak_deviation_z.toFixed(2)}&sigma;
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
              Current Deviation (|Z|)
            </span>
            <span className="text-lg font-bold text-teal-300 font-mono mt-0.5 block">
              {data.recovery.current_deviation_z.toFixed(2)}&sigma;
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
              Est. Sessions to Baseline
            </span>
            <span className="text-lg font-bold text-slate-200 font-mono mt-0.5 block">
              {data.recovery.estimated_sessions_to_recovery !== null
                ? `~${data.recovery.estimated_sessions_to_recovery} sessions`
                : 'Nominal'}
            </span>
          </div>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3">
            <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">
              Confidence Interval
            </span>
            <span className="text-lg font-bold text-slate-300 font-mono mt-0.5 block">
              &plusmn;{data.recovery.uncertainty_pct.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Domain-specific recovery indices */}
        {Object.keys(data.recovery.domain_recovery_indices).length > 0 && (
          <div>
            <span className="text-xs font-semibold text-slate-300 block mb-2">
              Domain-Specific Recovery Indices
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {Object.entries(data.recovery.domain_recovery_indices).map(([dom, val]) => (
                <div key={dom} className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="capitalize text-slate-300 font-medium">{dom}</span>
                    <span className="font-mono font-bold text-teal-400">{val.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-teal-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, val))}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expected vs Observed Trajectory Comparison Chart */}
        {data.recovery.expected_vs_observed.length > 0 && (
          <div className="mt-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-300">
                Expected vs. Observed Recovery Trajectory
              </span>
              <span className="text-[10px] text-slate-500">
                Model: R(t) = 100(1 - e^-t/7)
              </span>
            </div>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={data.recovery.expected_vs_observed}
                  margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="session"
                    stroke="#64748b"
                    tick={{ fontSize: 10 }}
                    label={{ value: 'Session', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#64748b' }}
                  />
                  <YAxis
                    stroke="#64748b"
                    tick={{ fontSize: 10 }}
                    domain={[0, 100]}
                    label={{ value: 'Recovery %', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#64748b' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Line
                    type="monotone"
                    dataKey="expected_recovery"
                    name="Expected Trajectory"
                    stroke="#94a3b8"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="observed_recovery"
                    name="Observed Trajectory"
                    stroke="#14b8a6"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: '#14b8a6' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* 3. Change Points & Treatment Event Correlations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Change-Point Detection (CUSUM) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-sky-400" />
              <h4 className="text-sm font-bold text-slate-100">CUSUM Change-Point Detection</h4>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Statistical two-sided cumulative sum testing for empirical behavioral transition points.
            </p>

            {data.change_points.length === 0 || !data.change_points.some((cp) => cp.has_change_point) ? (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 text-center">
                No discrete change point detected. Behavioral measures remain within empirical baseline variance.
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {data.change_points
                  .filter((cp) => cp.has_change_point)
                  .map((cp, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">
                          Estimated Onset: {cp.estimated_date || 'N/A'}
                        </span>
                        <span className="font-mono text-amber-400 font-bold">
                          &Delta;Z: {cp.shift_magnitude_z?.toFixed(2)}&sigma;
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Confidence: {(cp.confidence_score * 100).toFixed(0)}%</span>
                        <span>Sample Index #{cp.change_point_index}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Mandatory Disclaimer */}
          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 italic flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 text-slate-500" />
            <span>Estimated empirical monitoring change point; not the onset of a disease.</span>
          </div>
        </div>

        {/* Treatment Events & Correlations */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-400" />
                <h4 className="text-sm font-bold text-slate-100">Treatment Events & Timeline</h4>
              </div>
              <button
                onClick={() => setShowEventModal(true)}
                className="text-xs text-sky-400 hover:text-sky-300 font-medium"
              >
                + Add Event
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Medication adjustments, therapy milestones, or clinical interventions.
            </p>

            {/* Non-causal correlations banner */}
            {data.treatment_correlations.length > 0 && (
              <div className="mb-3 flex flex-col gap-1.5">
                {data.treatment_correlations.map((corr, idx) => (
                  <div
                    key={idx}
                    className="bg-sky-950/40 border border-sky-500/30 rounded-xl p-2.5 text-xs text-sky-200 leading-relaxed"
                  >
                    {corr}
                  </div>
                ))}
              </div>
            )}

            {/* Events List */}
            {data.treatment_events.length === 0 ? (
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs text-slate-400 text-center">
                No treatment events recorded yet.
              </div>
            ) : (
              <div className="max-h-48 overflow-y-auto flex flex-col gap-2 pr-1">
                {data.treatment_events.map((ev) => (
                  <div
                    key={ev.id}
                    className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex items-start justify-between gap-2"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 capitalize">
                          {ev.event_type.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs font-semibold text-slate-200">{ev.title}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-2">
                        <span>{ev.event_date}</span>
                        {ev.logged_by && <span>• Logged by: {ev.logged_by}</span>}
                      </div>
                      {ev.description && (
                        <p className="text-xs text-slate-400 mt-1">{ev.description}</p>
                      )}
                    </div>
                    {isDoctor && (
                      <button
                        onClick={() => handleDeleteEvent(ev.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition"
                        title="Delete event"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800 text-[11px] text-slate-500 italic">
            Temporal associations are observational and do not imply clinical causation.
          </div>
        </div>
      </div>

      {/* 4. Structured Neurological Change Profiles */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              <h4 className="text-sm font-bold text-slate-100">Neurological Change Profiles</h4>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Empirical deviations across behavioral modalities compared with frozen baseline.
            </p>
          </div>

          {/* Domain Filter Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveDomainFilter('all')}
              className={`text-xs px-2.5 py-1 rounded-lg transition ${
                activeDomainFilter === 'all'
                  ? 'bg-sky-600 text-white font-semibold'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              All Domains
            </button>
            {domains.map((dom) => (
              <button
                key={dom}
                onClick={() => setActiveDomainFilter(dom)}
                className={`text-xs px-2.5 py-1 rounded-lg capitalize transition ${
                  activeDomainFilter === dom
                    ? 'bg-sky-600 text-white font-semibold'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {dom}
              </button>
            ))}
          </div>
        </div>

        {/* Change Profile Cards */}
        {filteredProfiles.length === 0 ? (
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-400">
            No behavioral changes detected in selected domain filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredProfiles.map((prof, idx) => {
              const isSignificant = Math.abs(prof.magnitude_z) >= 1.5;
              const isSingleSession = prof.duration_sessions === 1;

              return (
                <div
                  key={idx}
                  className={`bg-slate-950 border rounded-xl p-4 flex flex-col justify-between transition ${
                    isSignificant ? 'border-amber-500/40' : 'border-slate-800'
                  }`}
                >
                  <div>
                    {/* Header: Domain & Trend */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 uppercase font-semibold">
                        {prof.domain}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {prof.trend === 'improving' && (
                          <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-medium">
                            <TrendingUp className="w-3.5 h-3.5" /> Improving
                          </span>
                        )}
                        {prof.trend === 'deteriorating' && (
                          <span className="flex items-center gap-1 text-[11px] text-rose-400 font-medium">
                            <TrendingDown className="w-3.5 h-3.5" /> Deteriorating
                          </span>
                        )}
                        {prof.trend === 'stable' && (
                          <span className="text-[11px] text-slate-400 font-medium">Stable</span>
                        )}
                        {prof.trend === 'inconsistent' && (
                          <span className="text-[11px] text-amber-400 font-medium">Inconsistent</span>
                        )}
                      </div>
                    </div>

                    {/* What changed */}
                    <h5 className="text-xs font-bold text-slate-100 mb-1">{prof.what_changed}</h5>

                    {/* Values comparison */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-900/60 rounded-lg p-2 my-2 text-center">
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Baseline</span>
                        <span className="text-xs font-mono font-bold text-slate-300">
                          {prof.baseline_value.toFixed(2)} {prof.unit}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Current</span>
                        <span className="text-xs font-mono font-bold text-slate-200">
                          {prof.current_value.toFixed(2)} {prof.unit}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase tracking-wider text-slate-500 block">Deviation</span>
                        <span
                          className={`text-xs font-mono font-bold ${
                            isSignificant ? 'text-amber-400' : 'text-slate-400'
                          }`}
                        >
                          {prof.magnitude_z >= 0 ? `+${prof.magnitude_z.toFixed(2)}` : prof.magnitude_z.toFixed(2)}&sigma;
                        </span>
                      </div>
                    </div>

                    {/* Single Abnormal Session Rule Alert */}
                    {isSingleSession && isSignificant && (
                      <div className="bg-amber-950/50 border border-amber-500/40 rounded-lg px-2.5 py-1.5 my-2 flex items-center gap-1.5 text-amber-300 text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Observed once &mdash; repeat assessment recommended.</span>
                      </div>
                    )}

                    {/* Clinical Relevance */}
                    <p className="text-[11px] text-slate-400 leading-relaxed mb-2">
                      {prof.possible_clinical_relevance}
                    </p>
                  </div>

                  {/* Footer metadata */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Quality: {prof.data_quality}</span>
                    <span>Duration: {prof.duration_sessions} session(s)</span>
                    {prof.evidence_reference.length > 0 && (
                      <span>Evidence: {prof.evidence_reference[0]}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Treatment Event Modal */}
      {showEventModal && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-400" />
                <span>Log Clinical or Treatment Event</span>
              </h3>
              <button
                onClick={() => setShowEventModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Record a treatment change, medication adjustment, or lifestyle event to correlate against behavioral biomarkers.
            </p>

            <form onSubmit={handleCreateEvent} className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Event Type</label>
                <select
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:border-sky-500"
                >
                  <option value="medication_change">Medication Adjustment</option>
                  <option value="therapy_session">Physical / Speech Therapy</option>
                  <option value="surgery">Surgical Intervention</option>
                  <option value="lifestyle">Lifestyle / Rehabilitation</option>
                  <option value="other">Other Clinical Event</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Date</label>
                <input
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Title / Summary</label>
                <input
                  type="text"
                  placeholder="e.g. Levodopa dosage increased to 150mg"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:border-sky-500"
                  required
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 block mb-1">Details (Optional)</label>
                <textarea
                  placeholder="Clinical rationale, patient notes, or observed effects..."
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-lg p-2.5 outline-none focus:border-sky-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEvent}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg transition disabled:opacity-50"
                >
                  {isSubmittingEvent ? 'Saving...' : 'Record Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
