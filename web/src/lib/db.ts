import Dexie, { type Table } from 'dexie';
import type { Assessment, Feature, Patient } from '../types';

export interface OfflineSyncItem {
  id?: number;
  endpoint: string;
  method: 'POST' | 'PATCH' | 'PUT';
  payload: any;
  createdAt: number;
  status: 'pending' | 'syncing' | 'failed';
}

export class NeuroCareDatabase extends Dexie {
  patients!: Table<Patient, string>;
  assessments!: Table<Assessment, string>;
  features!: Table<Feature, string>;
  offlineQueue!: Table<OfflineSyncItem, number>;

  constructor() {
    super('NeuroCareOfflineDB');
    this.version(1).stores({
      patients: 'id, mrn, first_name, last_name',
      assessments: 'id, patient_id, status, started_at',
      features: '++id, assessment_id, domain, feature_name',
      offlineQueue: '++id, endpoint, status, createdAt',
    });
  }
}

export const offlineDb = new NeuroCareDatabase();
