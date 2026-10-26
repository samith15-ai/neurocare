import { extractTappingMetrics, type SignalSample, type FingerTappingMetrics } from './tappingSignal';

export interface WorkerProcessRequest {
  type: 'PROCESS_SAMPLES';
  samples: SignalSample[];
  hand: 'right' | 'left';
  quality: 'valid' | 'limited' | 'insufficient';
}

export interface WorkerProcessResponse {
  type: 'PROCESS_RESULT';
  metrics: FingerTappingMetrics;
}

// In worker environment
if (typeof self !== 'undefined' && typeof window === 'undefined') {
  self.onmessage = (e: MessageEvent<WorkerProcessRequest>) => {
    if (e.data.type === 'PROCESS_SAMPLES') {
      const { samples, hand, quality } = e.data;
      const metrics = extractTappingMetrics(samples, hand, quality);
      self.postMessage({
        type: 'PROCESS_RESULT',
        metrics,
      } as WorkerProcessResponse);
    }
  };
}

/**
 * Worker bridge helper with automatic main-thread fallback if Web Workers are restricted
 */
export async function processTappingInWorker(
  samples: SignalSample[],
  hand: 'right' | 'left',
  quality: 'valid' | 'limited' | 'insufficient'
): Promise<FingerTappingMetrics> {
  if (typeof Worker !== 'undefined') {
    try {
      return await new Promise<FingerTappingMetrics>((resolve) => {
        const worker = new Worker(new URL('./tappingWorker.ts', import.meta.url), {
          type: 'module',
        });
        const timeout = setTimeout(() => {
          worker.terminate();
          resolve(extractTappingMetrics(samples, hand, quality));
        }, 2000);

        worker.onmessage = (event: MessageEvent<WorkerProcessResponse>) => {
          clearTimeout(timeout);
          worker.terminate();
          resolve(event.data.metrics);
        };

        worker.onerror = () => {
          clearTimeout(timeout);
          worker.terminate();
          // Fallback to synchronous execution
          resolve(extractTappingMetrics(samples, hand, quality));
        };

        worker.postMessage({
          type: 'PROCESS_SAMPLES',
          samples,
          hand,
          quality,
        } as WorkerProcessRequest);
      });
    } catch {
      // Direct fallback
      return extractTappingMetrics(samples, hand, quality);
    }
  }
  return extractTappingMetrics(samples, hand, quality);
}
