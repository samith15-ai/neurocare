import { Capacitor } from '@capacitor/core';
import type { MicrophoneService } from './interfaces';

class WebMicrophoneService implements MicrophoneService {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  async startRecording(onAudioProcess?: (audioData: Float32Array, sampleRate: number) => void): Promise<MediaStream> {
    this.recordedChunks = [];
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
      video: false,
    });

    this.mediaStream = stream;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    this.audioContext = new AudioCtx();
    const source = this.audioContext.createMediaStreamSource(stream);

    if (onAudioProcess) {
      // Use ScriptProcessorNode or Analyser for live feature streaming
      const processor = this.audioContext.createScriptProcessor(2048, 1, 1);
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        onAudioProcess(inputData, this.audioContext?.sampleRate || 44100);
      };
      source.connect(processor);
      processor.connect(this.audioContext.destination);
    }

    try {
      this.mediaRecorder = new MediaRecorder(stream);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.recordedChunks.push(e.data);
      };
      this.mediaRecorder.start(100);
    } catch {
      // Fallback if media recorder unsupported
    }

    return stream;
  }

  async stopRecording(): Promise<Blob | null> {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      await this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    if (this.recordedChunks.length > 0) {
      return new Blob(this.recordedChunks, { type: 'audio/webm' });
    }
    return null;
  }

  computeSNR(audioBuffer: Float32Array): number {
    let signalSum = 0;
    let noiseSum = 0;
    let signalCount = 0;
    let noiseCount = 0;

    // Adaptive noise threshold
    const threshold = 0.02;
    for (let i = 0; i < audioBuffer.length; i++) {
      const val = Math.abs(audioBuffer[i]);
      if (val > threshold) {
        signalSum += val * val;
        signalCount++;
      } else {
        noiseSum += val * val;
        noiseCount++;
      }
    }

    const signalPower = signalCount > 0 ? signalSum / signalCount : 0.0001;
    const noisePower = noiseCount > 0 ? noiseSum / noiseCount : 0.00001;

    const snr = 10 * Math.log10(signalPower / Math.max(noisePower, 1e-9));
    return Math.max(0, Math.min(60, snr));
  }
}

class NativeMicrophoneService implements MicrophoneService {
  private webFallback = new WebMicrophoneService();

  async startRecording(onAudioProcess?: (audioData: Float32Array, sampleRate: number) => void): Promise<MediaStream> {
    return this.webFallback.startRecording(onAudioProcess);
  }

  async stopRecording(): Promise<Blob | null> {
    return this.webFallback.stopRecording();
  }

  computeSNR(audioBuffer: Float32Array): number {
    return this.webFallback.computeSNR(audioBuffer);
  }
}

export const microphoneService: MicrophoneService = Capacitor.isNativePlatform()
  ? new NativeMicrophoneService()
  : new WebMicrophoneService();
