import { offlineDb } from './db';
import type { DailyCheckin, Feature } from '../types';
import { networkService } from '../platform';

export interface SyncStatus {
  isOnline: boolean;
  pendingCount: number;
  lastSyncTime: number | null;
  isSyncing: boolean;
}

class OfflineSyncManager {
  private isSyncing = false;
  private listeners: Array<(status: SyncStatus) => void> = [];
  private lastSyncTime: number | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.syncPendingQueue();
      });
      window.addEventListener('offline', () => {
        this.notify();
      });
    }
  }

  public subscribe(cb: (status: SyncStatus) => void): () => void {
    this.listeners.push(cb);
    this.getStatus().then(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  public async getStatus(): Promise<SyncStatus> {
    const isOnline = await networkService.isOnline();
    const pendingCount = await offlineDb.offlineQueue.where('status').equals('pending').count();
    return {
      isOnline,
      pendingCount,
      lastSyncTime: this.lastSyncTime,
      isSyncing: this.isSyncing,
    };
  }

  private async notify() {
    const status = await this.getStatus();
    this.listeners.forEach((l) => l(status));
  }

  /**
   * Save check-in locally first (Offline-First architecture).
   * Generates a persistent idempotency key to prevent duplicate records.
   */
  public async queueCheckin(
    checkin: Omit<DailyCheckin, 'idempotency_key' | 'is_synced'> & { idempotency_key?: string },
    features?: Feature[]
  ): Promise<DailyCheckin> {
    const key = checkin.idempotency_key || `NC-CHK-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const fullCheckin: DailyCheckin = {
      ...checkin,
      idempotency_key: key,
      is_synced: false,
      created_at: new Date().toISOString(),
    };

    // 1. Cache in local Dexie database
    await offlineDb.dailyCheckins.put(fullCheckin);

    // 2. Cache features if present
    if (features && features.length > 0) {
      await offlineDb.features.bulkPut(features);
    }

    // 3. Enqueue to sync queue
    await offlineDb.offlineQueue.add({
      endpoint: '/api/v1/checkins/sync-batch',
      method: 'POST',
      payload: {
        checkins: [fullCheckin],
        features: features || [],
      },
      createdAt: Date.now(),
      status: 'pending',
      retryCount: 0,
    });

    this.notify();

    // 4. If online, attempt background sync immediately
    const online = await networkService.isOnline();
    if (online) {
      this.syncPendingQueue().catch(console.error);
    }

    return fullCheckin;
  }

  /**
   * Sync all pending queue items with duplicate prevention
   */
  public async syncPendingQueue(): Promise<{ synced: number; failed: number }> {
    const online = await networkService.isOnline();
    if (!online || this.isSyncing) {
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.notify();

    let synced = 0;
    let failed = 0;

    try {
      const pendingItems = await offlineDb.offlineQueue
        .where('status')
        .equals('pending')
        .toArray();

      for (const item of pendingItems) {
        if (!item.id) continue;
        try {
          await offlineDb.offlineQueue.update(item.id, { status: 'syncing' });

          const res = await fetch(item.endpoint, {
            method: item.method,
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(item.payload),
          });

          if (res.ok) {
            await offlineDb.offlineQueue.delete(item.id);
            // Mark check-ins as synced
            if (item.payload?.checkins) {
              for (const c of item.payload.checkins) {
                await offlineDb.dailyCheckins.update(c.idempotency_key, { is_synced: true });
              }
            }
            synced++;
          } else {
            // Failed HTTP response
            const currentRetries = (item.retryCount || 0) + 1;
            await offlineDb.offlineQueue.update(item.id, {
              status: 'pending',
              retryCount: currentRetries,
            });
            failed++;
          }
        } catch (err) {
          const currentRetries = (item.retryCount || 0) + 1;
          await offlineDb.offlineQueue.update(item.id, {
            status: 'pending',
            retryCount: currentRetries,
          });
          failed++;
        }
      }

      this.lastSyncTime = Date.now();
    } finally {
      this.isSyncing = false;
      this.notify();
    }

    return { synced, failed };
  }
}

export const offlineSyncManager = new OfflineSyncManager();
