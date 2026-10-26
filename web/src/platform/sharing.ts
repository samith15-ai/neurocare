import { Capacitor } from '@capacitor/core';
import type { SharingService } from './interfaces';

class WebSharingService implements SharingService {
  async shareReport(title: string, text: string, url?: string): Promise<boolean> {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: url || window.location.href });
        return true;
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          console.warn('Share error', e);
        }
        return false;
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(`${title}\n\n${text}\n${url || ''}`);
        return true;
      } catch {
        return false;
      }
    }
  }
}

class NativeSharingService implements SharingService {
  private webFallback = new WebSharingService();

  async shareReport(title: string, text: string, url?: string): Promise<boolean> {
    return this.webFallback.shareReport(title, text, url);
  }
}

export const sharingService: SharingService = Capacitor.isNativePlatform()
  ? new NativeSharingService()
  : new WebSharingService();
