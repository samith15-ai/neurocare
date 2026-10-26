import { Capacitor } from '@capacitor/core';
import type { FileHandlingService } from './interfaces';

class WebFileHandlingService implements FileHandlingService {
  async saveReport(filename: string, content: string | Blob, mimeType: string = 'text/plain'): Promise<string> {
    const blob = typeof content === 'string' ? new Blob([content], { type: mimeType }) : content;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  }
}

class NativeFileHandlingService implements FileHandlingService {
  private webFallback = new WebFileHandlingService();

  async saveReport(filename: string, content: string | Blob, mimeType: string = 'text/plain'): Promise<string> {
    return this.webFallback.saveReport(filename, content, mimeType);
  }
}

export const fileHandlingService: FileHandlingService = Capacitor.isNativePlatform()
  ? new NativeFileHandlingService()
  : new WebFileHandlingService();
