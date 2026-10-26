import { Capacitor } from '@capacitor/core';
import type { NotificationsService } from './interfaces';

class WebNotificationsService implements NotificationsService {
  async scheduleLocal(title: string, body: string, delaySeconds: number = 0): Promise<void> {
    if (!('Notification' in window)) return;

    if (Notification.permission === 'granted') {
      if (delaySeconds > 0) {
        setTimeout(() => {
          new Notification(title, { body, icon: '/favicon.ico' });
        }, delaySeconds * 1000);
      } else {
        new Notification(title, { body, icon: '/favicon.ico' });
      }
    }
  }

  async requestPermission(): Promise<boolean> {
    if (!('Notification' in window)) return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }
}

class NativeNotificationsService implements NotificationsService {
  private webFallback = new WebNotificationsService();

  async scheduleLocal(title: string, body: string, delaySeconds: number = 0): Promise<void> {
    return this.webFallback.scheduleLocal(title, body, delaySeconds);
  }

  async requestPermission(): Promise<boolean> {
    return this.webFallback.requestPermission();
  }
}

export const notificationsService: NotificationsService = Capacitor.isNativePlatform()
  ? new NativeNotificationsService()
  : new WebNotificationsService();
