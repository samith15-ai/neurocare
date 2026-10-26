import { Capacitor } from '@capacitor/core';
import type { StorageService } from './interfaces';

class WebStorageService implements StorageService {
  async getItem<T>(key: string, defaultValue?: T): Promise<T | null> {
    try {
      const item = localStorage.getItem(`neurocare_${key}`);
      return item ? JSON.parse(item) : (defaultValue ?? null);
    } catch {
      return defaultValue ?? null;
    }
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    try {
      localStorage.setItem(`neurocare_${key}`, JSON.stringify(value));
    } catch (e) {
      console.warn('Storage quota exceeded or error writing to localStorage', e);
    }
  }

  async removeItem(key: string): Promise<void> {
    localStorage.removeItem(`neurocare_${key}`);
  }

  async clear(): Promise<void> {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('neurocare_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
}

class NativeStorageService implements StorageService {
  private webFallback = new WebStorageService();

  async getItem<T>(key: string, defaultValue?: T): Promise<T | null> {
    return this.webFallback.getItem<T>(key, defaultValue);
  }

  async setItem<T>(key: string, value: T): Promise<void> {
    return this.webFallback.setItem<T>(key, value);
  }

  async removeItem(key: string): Promise<void> {
    return this.webFallback.removeItem(key);
  }

  async clear(): Promise<void> {
    return this.webFallback.clear();
  }
}

export const storageService: StorageService = Capacitor.isNativePlatform()
  ? new NativeStorageService()
  : new WebStorageService();
