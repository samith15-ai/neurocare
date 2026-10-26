import { Capacitor } from '@capacitor/core';
import type { PermissionsService } from './interfaces';

class WebPermissionsService implements PermissionsService {
  async requestCameraPermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  }

  async requestMicrophonePermission(): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      return true;
    } catch {
      return false;
    }
  }

  async checkPermissions(): Promise<{ camera: boolean; microphone: boolean }> {
    try {
      const cam = navigator.permissions ? await navigator.permissions.query({ name: 'camera' as any }) : null;
      const mic = navigator.permissions ? await navigator.permissions.query({ name: 'microphone' as any }) : null;
      return {
        camera: cam ? cam.state === 'granted' : true,
        microphone: mic ? mic.state === 'granted' : true,
      };
    } catch {
      return { camera: true, microphone: true };
    }
  }
}

class NativePermissionsService implements PermissionsService {
  private webFallback = new WebPermissionsService();

  async requestCameraPermission(): Promise<boolean> {
    return this.webFallback.requestCameraPermission();
  }

  async requestMicrophonePermission(): Promise<boolean> {
    return this.webFallback.requestMicrophonePermission();
  }

  async checkPermissions(): Promise<{ camera: boolean; microphone: boolean }> {
    return this.webFallback.checkPermissions();
  }
}

export const permissionsService: PermissionsService = Capacitor.isNativePlatform()
  ? new NativePermissionsService()
  : new WebPermissionsService();
