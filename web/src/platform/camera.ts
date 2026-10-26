import { Capacitor } from '@capacitor/core';
import type { CameraService } from './interfaces';

class WebCameraService implements CameraService {
  private activeStream: MediaStream | null = null;

  async startStream(
    videoElement: HTMLVideoElement,
    options: { facingMode?: 'user' | 'environment'; width?: number; height?: number } = {}
  ): Promise<MediaStream> {
    this.stopStream();

    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: options.facingMode || 'user',
        width: { ideal: options.width || 1280 },
        height: { ideal: options.height || 720 },
      },
      audio: false,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.activeStream = stream;
    videoElement.srcObject = stream;
    await videoElement.play().catch(() => {});
    return stream;
  }

  stopStream(stream?: MediaStream): void {
    const s = stream || this.activeStream;
    if (s) {
      s.getTracks().forEach((track) => track.stop());
    }
    if (s === this.activeStream) {
      this.activeStream = null;
    }
  }

  async capturePhoto(): Promise<string> {
    const canvas = document.createElement('canvas');
    if (!this.activeStream) {
      return '';
    }
    const track = this.activeStream.getVideoTracks()[0];
    const imageCapture = (window as any).ImageCapture ? new (window as any).ImageCapture(track) : null;
    if (imageCapture) {
      const bitmap = await imageCapture.grabFrame();
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(bitmap, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.9);
    }
    return '';
  }
}

class NativeCameraService implements CameraService {
  private webFallback = new WebCameraService();

  async startStream(videoElement: HTMLVideoElement, options = {}): Promise<MediaStream> {
    // In Capacitor webview, getUserMedia operates under native camera permissions
    return this.webFallback.startStream(videoElement, options);
  }

  stopStream(stream?: MediaStream): void {
    this.webFallback.stopStream(stream);
  }

  async capturePhoto(): Promise<string> {
    return this.webFallback.capturePhoto();
  }
}

export const cameraService: CameraService = Capacitor.isNativePlatform()
  ? new NativeCameraService()
  : new WebCameraService();
