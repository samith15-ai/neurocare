export interface CameraService {
  startStream(videoElement: HTMLVideoElement, options?: { facingMode?: 'user' | 'environment'; width?: number; height?: number }): Promise<MediaStream>;
  stopStream(stream?: MediaStream): void;
  capturePhoto(): Promise<string>;
}

export interface MicrophoneService {
  startRecording(onAudioProcess?: (audioData: Float32Array, sampleRate: number) => void): Promise<MediaStream>;
  stopRecording(): Promise<Blob | null>;
  computeSNR(audioBuffer: Float32Array): number;
}

export interface PermissionsService {
  requestCameraPermission(): Promise<boolean>;
  requestMicrophonePermission(): Promise<boolean>;
  checkPermissions(): Promise<{ camera: boolean; microphone: boolean }>;
}

export interface StorageService {
  getItem<T>(key: string, defaultValue?: T): Promise<T | null>;
  setItem<T>(key: string, value: T): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

export interface NotificationsService {
  scheduleLocal(title: string, body: string, delaySeconds?: number): Promise<void>;
  requestPermission(): Promise<boolean>;
}

export interface NetworkService {
  isOnline(): Promise<boolean>;
  onStatusChange(callback: (online: boolean) => void): () => void;
}

export interface FileHandlingService {
  saveReport(filename: string, content: string | Blob, mimeType?: string): Promise<string>;
}

export interface SharingService {
  shareReport(title: string, text: string, url?: string): Promise<boolean>;
}
