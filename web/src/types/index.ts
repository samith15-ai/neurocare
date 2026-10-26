export type UserRole = 'doctor' | 'patient';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

export interface Patient {
  id: string;
  user_id?: string;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: string;
  primary_condition_notes?: string;
  created_at: string;
}

export interface Assessment {
  id: string;
  patient_id: string;
  clinician_id?: string;
  assessment_type: 'multimodal_standard' | 'facial' | 'motor' | 'vocal';
  status: 'pending' | 'completed' | 'rejected_quality';
  quality_gate_passed: boolean;
  quality_notes?: string;
  is_simulated: boolean;
  started_at: string;
  completed_at?: string;
}

export interface Feature {
  id?: string;
  assessment_id: string;
  domain: 'facial' | 'motor' | 'vocal' | 'gait' | 'balance' | 'cognition' | string;
  feature_name: string;
  value: number;
  unit: string;
  confidence: number;
  is_simulated: boolean;
  raw_payload?: string;
}

export interface Baseline {
  id: string;
  patient_id: string;
  domain: 'facial' | 'motor' | 'vocal' | 'gait' | 'balance' | 'cognition' | string;
  feature_name: string;
  mean_value: number;
  std_value: number;
  median_value?: number;
  mad_value?: number;
  sample_count: number;
  is_established?: boolean;
  is_frozen?: boolean;
  status_message?: string;
  updated_at: string;
}

export interface BaselineStatus {
  patient_id: string;
  is_established: boolean;
  is_frozen: boolean;
  sample_count: number;
  required_sessions: number;
  status_message: string;
  baselines: Array<{
    domain: string;
    feature_name: string;
    median_value: number;
    mad_value?: number;
    std_value: number;
    sample_count: number;
    is_frozen: boolean;
  }>;
}

export interface Invitation {
  id: string;
  code: string;
  doctor_id: string;
  patient_id?: string;
  patient_email?: string;
  status: 'pending' | 'accepted' | 'expired' | 'revoked';
  expires_at: string;
  created_at: string;
  invite_url?: string;
}

export interface PatientConsent {
  id: string;
  patient_id: string;
  consent_version: string;
  consent_features: boolean;
  consent_evidence_clips: boolean;
  consent_research: boolean;
  is_revoked: boolean;
  revoked_at?: string;
  revoked_scope?: string;
  signature_name: string;
  signed_at: string;
  updated_at: string;
}

export interface MonitoringPlan {
  id: string;
  patient_id: string;
  clinician_id: string;
  assessment_types: string;
  frequency: string;
  start_date: string;
  duration_days: number;
  reminder_time: string;
  reminder_enabled: boolean;
  reminder_channel: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DailyCheckin {
  id?: string;
  patient_id: string;
  assessment_id?: string;
  checkin_date: string;
  idempotency_key: string;
  medication_taken: boolean;
  medication_notes?: string;
  sleep_quality?: number;
  fatigue_level?: number;
  pain_level?: number;
  stress_level?: number;
  is_synced: boolean;
  created_at?: string;
}

export interface DailyCheckinStatus {
  patient_id: string;
  is_completed_today: boolean;
  today_checkin?: DailyCheckin | null;
  current_streak: number;
  total_completed: number;
  reminder_time?: string;
  message: string;
}

export interface Finding {
  id: string;
  assessment_id: string;
  domain: 'facial' | 'motor' | 'speech' | 'vocal' | 'composite' | 'emergency_alert' | string;
  finding_title: string;
  explanation: string;
  evidence_metrics: string;
  clinical_relevance: string;
  requires_review: boolean;
  status: 'unreviewed' | 'reviewed' | 'acknowledged';
}

export interface Report {
  id: string;
  assessment_id: string;
  patient_id: string;
  summary_text: string;
  overall_status?: 'No flag' | 'Watch' | 'Review advised' | string;
  late_fusion_score: number | null;
  domain_scores_json?: string;
  emergency_fast_triggered: boolean;
  emergency_details?: string;
  explainability_notes?: string;
  is_simulated: boolean;
  approved_by_doctor: boolean;
  approved_by_user_id?: string;
  doctor_feedback?: 'agree' | 'disagree' | 'unsure' | null;
  doctor_notes?: string | null;
  created_at: string;
  findings?: Finding[];
  features?: Feature[];
}

export interface QualityGateState {
  passed: boolean;
  lighting_ok: boolean;
  framing_ok: boolean;
  audio_snr_ok: boolean;
  rejection_code?: string;
  guidance?: string;
  current_luma?: number;
  current_snr?: number;
}

export interface TrajectoryPoint {
  assessment_id: string;
  date: string;
  feature_name: string;
  value: number;
  unit: string;
  baseline_mean?: number;
  baseline_std?: number;
  deviation_sigmas?: number;
  is_simulated: boolean;
}

// Standard Assessment Output Schema (Phase 2 Requirement)
export interface StandardAssessmentOutput<T = Record<string, number | string>> {
  assessment_type: 'speech' | 'facial' | 'motor' | 'multimodal_standard';
  task_name: string;
  features: T;
  quality: {
    status: 'valid' | 'limited' | 'insufficient';
    reasons: string[];
    metrics: Record<string, number | boolean>;
  };
  evidence: {
    timestamps?: number[];
    sample_count: number;
    signal_summary?: string;
    raw_payload_ref?: string;
  };
  unavailable_features: string[];
  timestamp: string;
  is_simulated: boolean;
  metadata?: {
    device?: string;
    language?: 'en' | 'ta' | 'hi';
    trial?: number;
  };
}

// Phase 6: Longitudinal Intelligence & Recovery Tracking
export type TimelineState =
  | 'baseline'
  | 'onset'
  | 'active_change'
  | 'recovering'
  | 'recovered_or_stable'
  | 'relapse_watch';

export type AlertLevel = 'stable' | 'watch' | 'review_advised';

export type ChangeClassificationType =
  | 'stable'
  | 'sudden_deviation'
  | 'gradual_change'
  | 'persistent_change'
  | 'improvement'
  | 'inconsistent';

export interface NeurologicalChangeProfile {
  domain: string;
  what_changed: string;
  current_value: number;
  baseline_value: number;
  unit: string;
  magnitude_z: number;
  trend: 'improving' | 'deteriorating' | 'stable' | 'inconsistent' | string;
  duration_sessions: number;
  data_quality: string;
  context_tags: Record<string, any>;
  evidence_reference: string[];
  possible_clinical_relevance: string;
}

export interface ChangePoint {
  has_change_point: boolean;
  change_point_index?: number | null;
  estimated_date?: string | null;
  shift_magnitude_z?: number | null;
  confidence_score: number;
  disclaimer: string;
}

export interface ExpectedVsObservedRecovery {
  session: number;
  expected_recovery: number;
  observed_recovery: number;
  date?: string;
}

export interface RecoveryTracking {
  overall_recovery_index: number;
  domain_recovery_indices: Record<string, number>;
  peak_deviation_z: number;
  current_deviation_z: number;
  plateau_detected: boolean;
  plateau_note?: string | null;
  expected_vs_observed: ExpectedVsObservedRecovery[];
  estimated_sessions_to_recovery?: number | null;
  uncertainty_pct: number;
  experimental_disclaimer: string;
}

export interface TreatmentEvent {
  id: string;
  patient_id: string;
  logged_by?: string | null;
  event_type: 'medication_change' | 'therapy_session' | 'surgery' | 'lifestyle' | 'other' | string;
  event_date: string;
  title: string;
  description?: string | null;
  created_at: string;
}

export interface TreatmentEventCreate {
  patient_id: string;
  event_type: string;
  event_date: string;
  title: string;
  description?: string;
}

export interface LongitudinalIntelligenceReport {
  patient_id: string;
  timeline_state: TimelineState;
  timeline_explanation: string;
  overall_alert: AlertLevel;
  alert_explanation: string;
  emergency_fast_triggered: boolean;
  change_profiles: NeurologicalChangeProfile[];
  change_points: ChangePoint[];
  recovery: RecoveryTracking;
  treatment_events: TreatmentEvent[];
  treatment_correlations: string[];
  evaluated_at: string;
}
