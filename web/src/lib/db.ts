import Dexie, { type Table } from 'dexie';
import type { Assessment, Feature, Patient, DailyCheckin, MonitoringPlan, PatientConsent } from '../types';

export interface OfflineSyncItem {
  id?: number;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT';
  payload: any;
  createdAt: number;
  status: 'pending' | 'syncing' | 'failed';
  retryCount?: number;
}

export class NeuroCareDatabase extends Dexie {
  patients!: Table<Patient, string>;
  assessments!: Table<Assessment, string>;
  features!: Table<Feature, string>;
  offlineQueue!: Table<OfflineSyncItem, number>;
  dailyCheckins!: Table<DailyCheckin, string>;
  monitoringPlans!: Table<MonitoringPlan, string>;
  consents!: Table<PatientConsent, string>;

  constructor() {
    super('NeuroCareOfflineDB');
    this.version(1).stores({
      patients: 'id, mrn, first_name, last_name',
      assessments: 'id, patient_id, status, started_at',
      features: '++id, assessment_id, domain, feature_name',
      offlineQueue: '++id, endpoint, status, createdAt',
    });
    this.version(2).stores({
      patients: 'id, mrn, first_name, last_name',
      assessments: 'id, patient_id, status, started_at',
      features: '++id, assessment_id, domain, feature_name',
      offlineQueue: '++id, endpoint, status, createdAt',
      dailyCheckins: 'idempotency_key, patient_id, checkin_date, is_synced',
      monitoringPlans: 'id, patient_id, is_active',
      consents: 'id, patient_id, consent_version',
    });
  }
}

export const offlineDb = new NeuroCareDatabase();
