import { Capacitor } from '@capacitor/core';
import type { NetworkService } from './interfaces';

class WebNetworkService implements NetworkService {
  async isOnline(): Promise<boolean> {
    return navigator.onLine;
  }

  onStatusChange(callback: (online: boolean) => void): () => void {
    const handleOnline = () => callback(true);
    const handleOffline = () => callback(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }
}

class NativeNetworkService implements NetworkService {
  private webFallback = new WebNetworkService();

  async isOnline(): Promise<boolean> {
    return this.webFallback.isOnline();
  }

  onStatusChange(callback: (online: boolean) => void): () => void {
    return this.webFallback.onStatusChange(callback);
  }
}

export const networkService: NetworkService = Capacitor.isNativePlatform()
  ? new NativeNetworkService()
  : new WebNetworkService();
