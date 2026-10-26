import type {
  Patient,
  Assessment,
  Feature,
  Baseline,
  BaselineStatus,
  Report,
  TrajectoryPoint,
  User,
  Invitation,
  PatientConsent,
  MonitoringPlan,
  DailyCheckin,
  DailyCheckinStatus,
  TreatmentEvent,
  TreatmentEventCreate,
  LongitudinalIntelligenceReport,
  AIChatRequest,
  AIChatResponse,
  ClinicianSummaryDraft,
  ClinicianSummaryApproveRequest,
  ClinicianSummary,
} from '../types';
import { storageService, networkService } from '../platform';
import { offlineDb } from './db';

const API_BASE = '/api/v1';

async function getAuthHeader(): Promise<HeadersInit> {
  const token = await storageService.getItem<string>('auth_token');
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<{ access_token: string; role: 'doctor' | 'patient'; full_name: string; user_id: string }> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Authentication failed' }));
      throw new Error(err.detail || 'Authentication failed');
    }
    const data = await res.json();
    await storageService.setItem('auth_token', data.access_token);
    await storageService.setItem('current_user', {
      id: data.user_id,
      email,
      full_name: data.full_name,
      role: data.role,
      is_active: true,
    });
    return data;
  },

  async register(data: { email: string; password: string; full_name: string; role: 'doctor' | 'patient' }): Promise<User> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(err.detail || 'Registration failed');
    }
    return res.json();
  },

  async getCurrentUser(): Promise<User | null> {
    const isOnline = await networkService.isOnline();
    if (!isOnline) {
      return storageService.getItem<User>('current_user');
    }
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/auth/me`, { headers });
      if (res.ok) {
        const u = await res.json();
        await storageService.setItem('current_user', u);
        return u;
      }
    } catch {
      // Fallback to cache
    }
    return storageService.getItem<User>('current_user');
  },

  async logout(): Promise<void> {
    await storageService.removeItem('auth_token');
    await storageService.removeItem('current_user');
  },

  // Patients
  async getPatients(): Promise<Patient[]> {
    const isOnline = await networkService.isOnline();
    if (!isOnline) {
      return offlineDb.patients.toArray();
    }
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/patients`, { headers });
      if (res.ok) {
        const patients = await res.json();
        await offlineDb.patients.bulkPut(patients);
        return patients;
      }
    } catch {
      // Return cached
    }
    return offlineDb.patients.toArray();
  },

  async getPatient(id: string): Promise<Patient | undefined> {
    const local = await offlineDb.patients.get(id);
    try {
      const headers = await getAuthHeader();
      const res = await fetch(`${API_BASE}/patients/${id}`, { headers });
      if (res.ok) {
        const p = await res.json();
        await offlineDb.patients.put(p);
        return p;
      }
    } catch {}
    return local;
  },

  async createPatient(patient: Omit<Patient, 'id' | 'created_at'>): Promise<Patient> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/patients`, {
      method: 'POST',
      headers,
      body: JSON.stringify(patient),
    });
    if (!res.ok) throw new Error('Failed to create patient');
    const created = await res.json();
    await offlineDb.patients.put(created);
    return created;
  },

  // Assessments
  async createAssessment(data: {
    patient_id: string;
    assessment_type: string;
    quality_gate_passed: boolean;
    quality_notes?: string;
    is_simulated: boolean;
  }): Promise<Assessment> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/assessments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create assessment');
    const created = await res.json();
    await offlineDb.assessments.put(created);
    return created;
  },

  async saveFeatures(features: Feature[]): Promise<Feature[]> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/features/batch`, {
      method: 'POST',
      headers,
      body: JSON.stringify(features),
    });
    if (!res.ok) throw new Error('Failed to save features');
    const saved = await res.json();
    await offlineDb.features.bulkPut(saved);
    return saved;
  },

  async generateReport(assessmentId: string): Promise<Report> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/reports/generate/${assessmentId}`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) throw new Error('Failed to generate report');
    return res.json();
  },

  async getReportForAssessment(assessmentId: string): Promise<Report> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/reports/assessment/${assessmentId}`, { headers });
    if (!res.ok) throw new Error('Report not found');
    return res.json();
  },

  async getReport(reportId: string): Promise<Report> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/reports/${reportId}`, { headers });
    if (!res.ok) throw new Error('Report not found');
    return res.json();
  },

  async submitDoctorReview(
    reportId: string,
    feedback: 'agree' | 'disagree' | 'unsure',
    notes?: string,
    doctorUserId?: string
  ): Promise<Report> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/reports/${reportId}/review`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        feedback,
        notes,
        doctor_user_id: doctorUserId,
      }),
    });
    if (!res.ok) throw new Error('Failed to submit doctor review');
    return res.json();
  },

  async approveReport(reportId: string, doctorUserId?: string): Promise<Report> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/reports/${reportId}/approve${doctorUserId ? `?doctor_user_id=${doctorUserId}` : ''}`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) throw new Error('Failed to approve report');
    return res.json();
  },

  // Baselines & Longitudinal
  async getBaselines(patientId: string): Promise<Baseline[]> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/baselines/${patientId}`, { headers });
    if (!res.ok) return [];
    return res.json();
  },

  async getLongitudinal(patientId: string): Promise<{ trajectory_points: TrajectoryPoint[]; overall_status: string; advisory: string }> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/monitoring/longitudinal/${patientId}`, { headers });
    if (!res.ok) throw new Error('Failed to load longitudinal trajectory');
    return res.json();
  },

  // AI Assistant
  async askAIAssistant(patientId: string, question: string, assessmentId?: string): Promise<{
    summary: string;
    evidence_points: Array<{ metric_name: string; observed_value: number; unit: string; baseline_value?: number; change_direction: string; relevance_note: string }>;
    clinical_caution: string;
    confidence: number;
  }> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/ai/explain`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ patient_id: patientId, question, assessment_id: assessmentId }),
    });
    if (!res.ok) throw new Error('AI Assistant request failed');
    return res.json();
  },

  // Phase 5: Enrollment & Invitations
  async createInvitation(data: { patient_id?: string; patient_email?: string; expires_in_days?: number }): Promise<Invitation> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/enrollment/invitations`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to create invitation');
    return res.json();
  },

  async getInvitation(code: string): Promise<Invitation> {
    const res = await fetch(`${API_BASE}/enrollment/invitations/${code.toUpperCase()}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Invalid or expired invitation' }));
      throw new Error(err.detail || 'Invalid or expired invitation');
    }
    return res.json();
  },

  async registerWithInvite(data: any): Promise<any> {
    const res = await fetch(`${API_BASE}/enrollment/register-with-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Registration failed' }));
      throw new Error(err.detail || 'Registration failed');
    }
    const result = await res.json();
    if (result.access_token) {
      await storageService.setItem('auth_token', result.access_token);
      await storageService.setItem('current_user', {
        id: result.user_id,
        email: data.email,
        full_name: result.full_name,
        role: result.role,
        is_active: true,
      });
    }
    return result;
  },

  // Phase 5: Consent Management
  async getConsent(patientId: string): Promise<PatientConsent> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/enrollment/consent/${patientId}`, { headers });
    if (!res.ok) throw new Error('Consent record not found');
    return res.json();
  },

  async recordConsent(data: {
    patient_id: string;
    consent_version: string;
    consent_features: boolean;
    consent_evidence_clips: boolean;
    consent_research: boolean;
    signature_name: string;
  }): Promise<PatientConsent> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/enrollment/consent`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to record consent');
    return res.json();
  },

  async revokeConsent(data: { patient_id: string; scope: string; reason?: string }): Promise<PatientConsent> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/enrollment/consent/revoke`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to revoke consent');
    return res.json();
  },

  async deletePatientEvidence(patientId: string): Promise<{ status: string; purged_records: number; message: string }> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/enrollment/evidence/${patientId}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error('Failed to delete evidence');
    return res.json();
  },

  // Phase 5: Monitoring Plans
  async getMonitoringPlan(patientId: string): Promise<MonitoringPlan | null> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/monitoring-plans/patient/${patientId}`, { headers });
    if (!res.ok) return null;
    return res.json();
  },

  async saveMonitoringPlan(data: {
    patient_id: string;
    assessment_types: string[] | string;
    frequency: string;
    start_date: string;
    duration_days: number;
    reminder_time: string;
    reminder_enabled: boolean;
  }): Promise<MonitoringPlan> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/monitoring-plans`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to save monitoring plan');
    return res.json();
  },

  // Phase 5: Daily Check-in & Baseline Status
  async getTodayCheckinStatus(patientId: string): Promise<DailyCheckinStatus> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/checkins/today/${patientId}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch check-in status');
    return res.json();
  },

  async submitDailyCheckin(data: {
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
  }): Promise<DailyCheckin> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/checkins`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to submit daily check-in');
    return res.json();
  },

  async getBaselineStatus(patientId: string): Promise<BaselineStatus> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/baselines/${patientId}/status`, { headers });
    if (!res.ok) throw new Error('Failed to fetch baseline status');
    return res.json();
  },

  async computeBaselines(patientId: string, force = false): Promise<any> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/baselines/${patientId}/compute?force_recompute=${force}`, {
      method: 'POST',
      headers,
    });
    if (!res.ok) throw new Error('Failed to compute baseline');
    return res.json();
  },

  // Phase 6: Longitudinal Intelligence & Recovery Tracking
  async getLongitudinalAnalysis(patientId: string): Promise<LongitudinalIntelligenceReport> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/longitudinal/analysis/${patientId}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch longitudinal analysis' }));
      throw new Error(err.detail || 'Failed to fetch longitudinal analysis');
    }
    return res.json();
  },

  async getTreatmentEvents(patientId: string): Promise<TreatmentEvent[]> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/longitudinal/treatment-events/${patientId}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch treatment events');
    return res.json();
  },

  async createTreatmentEvent(data: TreatmentEventCreate): Promise<TreatmentEvent> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/longitudinal/treatment-events`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create treatment event' }));
      throw new Error(err.detail || 'Failed to create treatment event');
    }
    return res.json();
  },

  async deleteTreatmentEvent(eventId: string): Promise<void> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/longitudinal/treatment-events/${eventId}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error('Failed to delete treatment event');
  },

  // Phase 7: Grounded AI Assistant & Clinician Summary
  async sendAIChat(req: AIChatRequest): Promise<AIChatResponse> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to communicate with AI Assistant' }));
      throw new Error(err.detail || 'Failed to communicate with AI Assistant');
    }
    return res.json();
  },

  async getClinicianSummaryDraft(patientId: string): Promise<ClinicianSummaryDraft> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/ai/clinician-summary/draft/${patientId}`, { headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to generate clinician summary draft' }));
      throw new Error(err.detail || 'Failed to generate clinician summary draft');
    }
    return res.json();
  },

  async approveClinicianSummary(req: ClinicianSummaryApproveRequest): Promise<ClinicianSummary> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/ai/clinician-summary/approve`, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to approve clinician summary' }));
      throw new Error(err.detail || 'Failed to approve clinician summary');
    }
    return res.json();
  },

  async getApprovedClinicianSummaries(patientId: string): Promise<ClinicianSummary[]> {
    const headers = await getAuthHeader();
    const res = await fetch(`${API_BASE}/ai/clinician-summaries/${patientId}`, { headers });
    if (!res.ok) throw new Error('Failed to fetch clinician summaries');
    return res.json();
  },
};
