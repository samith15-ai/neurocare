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
  domain: 'facial' | 'motor' | 'vocal';
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
  domain: 'facial' | 'motor' | 'vocal';
  feature_name: string;
  mean_value: number;
  std_value: number;
  sample_count: number;
  updated_at: string;
}

export interface Finding {
  id: string;
  assessment_id: string;
  domain: 'facial' | 'motor' | 'vocal' | 'composite';
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
  late_fusion_score: number | null;
  emergency_fast_triggered: boolean;
  emergency_details?: string;
  explainability_notes?: string;
  is_simulated: boolean;
  approved_by_doctor: boolean;
  approved_by_user_id?: string;
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
