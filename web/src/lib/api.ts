import type { Patient, Assessment, Feature, Baseline, Report, TrajectoryPoint, User } from '../types';
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
};
