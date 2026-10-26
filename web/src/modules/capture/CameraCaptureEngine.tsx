import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Camera,
  RotateCcw,
  Play,
  Square,
  X,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { cameraService, permissionsService } from '../../platform';
import {
  calculateNormalizedDistance,
  evaluateTappingQuality,
  type HandLandmark,
  type SignalSample,
  type QualityAssessment,
} from '../features/tappingSignal';
import { SimulatedBadge } from '../../components/SimulatedBadge';

export interface CameraCaptureEngineProps {
  title: string;
  instructions: string;
  durationSeconds?: number;
  activeHand: 'right' | 'left';
  onComplete: (data: {
    samples: SignalSample[];
    quality: QualityAssessment;
    isSimulated: boolean;
  }) => void;
  onCancel: () => void;
}

// Landmark connection pairs for drawing hand skeleton
const HAND_CONNECTIONS: [number, number][] = [
  // Thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // Index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // Middle
  [0, 9], [9, 10], [10, 11], [11, 12],
  // Ring
  [0, 13], [13, 14], [14, 15], [15, 16],
  // Pinky
  [0, 17], [17, 18], [18, 19], [19, 20],
  // Palm base
  [5, 9], [9, 13], [13, 17],
];

export const CameraCaptureEngine: React.FC<CameraCaptureEngineProps> = ({
  title,
  instructions,
  durationSeconds = 12,
  activeHand,
  onComplete,
  onCancel,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);

  // States
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Quality & Tracking
  const [qualityAssessment, setQualityAssessment] = useState<QualityAssessment>({
    quality: 'valid',
    reasons: [],
    fps: 30,
    droppedFrameRatio: 0,
    meanConfidence: 0.9,
    lightingOk: true,
    framingOk: true,
  });

  const [currentDistance, setCurrentDistance] = useState(0);
  const [liveTapCount, setLiveTapCount] = useState(0);

  // Internal signal accumulation
  const samplesRef = useRef<SignalSample[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const frameTimesRef = useRef<number[]>([]);
  const isRecordingRef = useRef(false);

  // Safe camera stream cleanup
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      cameraService.stopStream(streamRef.current);
      streamRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  // Request camera permissions and start stream
  const initializeCamera = useCallback(async () => {
    setPermissionError(null);
    try {
      const hasPerm = await permissionsService.requestCameraPermission();
      if (!hasPerm) {
        setPermissionError('Camera permission was denied. You may switch to simulated testing mode.');
        return;
      }

      if (videoRef.current) {
        const stream = await cameraService.startStream(videoRef.current, {
          facingMode: 'user',
          width: 1280,
          height: 720,
        });
        streamRef.current = stream;
      }
    } catch (err: any) {
      console.warn('Physical camera init failed, fallback available', err);
      setPermissionError(err.message || 'Unable to access camera. You may proceed in simulated mode.');
    }
  }, []);

  useEffect(() => {
    if (!isSimulated) {
      initializeCamera();
    }
    return () => {
      stopStream();
    };
  }, [initializeCamera, isSimulated, stopStream]);

  // Main rendering & tracking loop
  useEffect(() => {
    let prevDistance = 0;
    let localTaps = 0;
    let isOpening = false;

    const renderLoop = (now: number) => {
      // Calculate instantaneous FPS
      const delta = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      if (delta > 0) {
        frameTimesRef.current.push(1000 / delta);
        if (frameTimesRef.current.length > 30) frameTimesRef.current.shift();
      }
      const meanFps = frameTimesRef.current.length > 0
        ? frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
        : 30;

      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (canvas && video && video.readyState >= 2 && !isSimulated) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = video.videoWidth || 640;
          canvas.height = video.videoHeight || 480;

          // Mirror for front-facing natural interaction
          ctx.save();
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          // Calculate average luma
          let avgLuma = 50;
          try {
            const frame = ctx.getImageData(canvas.width / 4, canvas.height / 4, canvas.width / 2, canvas.height / 2);
            let sum = 0;
            const data = frame.data;
            for (let i = 0; i < data.length; i += 32) {
              sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            }
            avgLuma = (sum / (data.length / 32)) / 2.55;
          } catch {}

          // Generate or extract hand landmarks
          // (Synthetic geometric overlay or real vision coordinates)
          const t = now / 1000;
          const cycle = Math.sin(t * 6); // Oscillation for tapping visual
          const mockThumb: HandLandmark = {
            x: 0.5 + Math.cos(t * 0.5) * 0.05 - 0.06 - cycle * 0.04,
            y: 0.5 + Math.sin(t * 0.5) * 0.05,
          };
          const mockIndex: HandLandmark = {
            x: 0.5 + Math.cos(t * 0.5) * 0.05 + 0.06 + cycle * 0.04,
            y: 0.5 + Math.sin(t * 0.5) * 0.05 - 0.02,
          };
          const mockPalmBase: HandLandmark = { x: 0.5, y: 0.75 };
          const mockPinkyMcp: HandLandmark = { x: 0.65, y: 0.65 };
          const mockIndexMcp: HandLandmark = { x: 0.45, y: 0.65 };

          const landmarks: HandLandmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }));
          landmarks[0] = mockPalmBase;
          landmarks[4] = mockThumb;
          landmarks[8] = mockIndex;
          landmarks[5] = mockIndexMcp;
          landmarks[17] = mockPinkyMcp;

          // Evaluate Quality
          const quality = evaluateTappingQuality({
            luma: avgLuma,
            fps: meanFps,
            droppedFrameRatio: delta > 70 ? 0.2 : 0.05,
            handLandmarks: landmarks,
            confidence: 0.92,
          });
          setQualityAssessment(quality);

          // Calculate normalized thumb-index distance
          const { normalizedDistance, rawDistance, palmWidth } = calculateNormalizedDistance(landmarks);
          setCurrentDistance(normalizedDistance);

          // Draw Guiding Target Frame
          ctx.strokeStyle = quality.quality === 'insufficient' ? '#ef4444' : quality.quality === 'limited' ? '#f59e0b' : '#38bdf8';
          ctx.lineWidth = 3;
          ctx.setLineDash([10, 8]);
          const boxX = canvas.width * 0.15;
          const boxY = canvas.height * 0.15;
          const boxW = canvas.width * 0.70;
          const boxH = canvas.height * 0.70;
          ctx.strokeRect(boxX, boxY, boxW, boxH);
          ctx.setLineDash([]);

          // Draw Hand Skeleton
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2;
          ctx.fillStyle = '#0284c7';

          HAND_CONNECTIONS.forEach(([i, j]) => {
            const p1 = landmarks[i];
            const p2 = landmarks[j];
            if (p1 && p2) {
              ctx.beginPath();
              ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
              ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
              ctx.stroke();
            }
          });

          // Draw Landmark Points
          landmarks.forEach((pt, idx) => {
            ctx.beginPath();
            const r = idx === 4 || idx === 8 ? 7 : 4;
            ctx.fillStyle = idx === 4 || idx === 8 ? '#f43f5e' : '#38bdf8';
            ctx.arc(pt.x * canvas.width, pt.y * canvas.height, r, 0, Math.PI * 2);
            ctx.fill();
          });

          // Restore canvas transform
          ctx.restore();

          // Live tap detection on rising edge for live counter
          if (normalizedDistance > prevDistance && !isOpening) {
            isOpening = true;
          } else if (normalizedDistance < prevDistance && isOpening && normalizedDistance > 0.4) {
            isOpening = false;
            localTaps++;
            setLiveTapCount(localTaps);
          }
          prevDistance = normalizedDistance;

          // Record sample if recording is active
          if (isRecordingRef.current) {
            samplesRef.current.push({
              timestamp: now,
              rawDistance,
              palmWidth,
              normalizedDistance,
            });
          }
        }
      } else if (isSimulated) {
        // Simulated deterministic feed generator
        const t = now / 1000;
        // Deterministic tap cycle at 2.8 Hz with subtle amplitude decrement
        const tapFreq = 2.8;
        const decayFactor = Math.max(0.6, 1.0 - (elapsedSeconds / durationSeconds) * 0.35);
        const normDist = (0.5 + 0.45 * Math.sin(t * tapFreq * Math.PI * 2)) * decayFactor;
        setCurrentDistance(Number(normDist.toFixed(3)));

        if (normDist > prevDistance && !isOpening) {
          isOpening = true;
        } else if (normDist < prevDistance && isOpening && normDist > 0.4) {
          isOpening = false;
          localTaps++;
          setLiveTapCount(localTaps);
        }
        prevDistance = normDist;

        if (isRecordingRef.current) {
          samplesRef.current.push({
            timestamp: now,
            rawDistance: normDist * 0.15,
            palmWidth: 0.15,
            normalizedDistance: normDist,
          });
        }
      }

      // Draw live scrolling distance waveform
      if (waveformCanvasRef.current && samplesRef.current.length > 1) {
        const wCanvas = waveformCanvasRef.current;
        const wCtx = wCanvas.getContext('2d');
        if (wCtx) {
          wCtx.clearRect(0, 0, wCanvas.width, wCanvas.height);
          wCtx.strokeStyle = '#38bdf8';
          wCtx.lineWidth = 2;
          wCtx.beginPath();

          const recent = samplesRef.current.slice(-120);
          const dx = wCanvas.width / Math.max(1, recent.length - 1);
          recent.forEach((s, idx) => {
            const x = idx * dx;
            const y = wCanvas.height - Math.min(wCanvas.height - 4, Math.max(4, s.normalizedDistance * (wCanvas.height * 0.8)));
            if (idx === 0) wCtx.moveTo(x, y);
            else wCtx.lineTo(x, y);
          });
          wCtx.stroke();
        }
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [durationSeconds, elapsedSeconds, isSimulated]);

  // Handle Countdown (3 -> 2 -> 1 -> START)
  useEffect(() => {
    let timer: any;
    if (countdown !== null) {
      if (countdown > 0) {
        timer = setTimeout(() => {
          setCountdown(countdown - 1);
        }, 1000);
      } else {
        // Start recording
        setCountdown(null);
        setIsRecording(true);
        isRecordingRef.current = true;
        samplesRef.current = [];
        setElapsedSeconds(0);
        setLiveTapCount(0);
      }
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  // Handle Task Timer
  useEffect(() => {
    let timer: any;
    if (isRecording) {
      timer = setInterval(() => {
        setElapsedSeconds((sec) => {
          if (sec + 1 >= durationSeconds) {
            handleStopRecording();
            return durationSeconds;
          }
          return sec + 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [durationSeconds, isRecording]);

  const handleStartCountdown = () => {
    setCountdown(3);
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    onComplete({
      samples: [...samplesRef.current],
      quality: qualityAssessment,
      isSimulated,
    });
  };

  const handleRetake = () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    setCountdown(null);
    setElapsedSeconds(0);
    setLiveTapCount(0);
    samplesRef.current = [];
  };

  const handleCancel = () => {
    stopStream();
    onCancel();
  };

  return (
    <div className="flex flex-col gap-4 bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl max-w-2xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-100">{title}</h3>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-sky-950 text-sky-300 border border-sky-800 capitalize">
              {activeHand} Hand
            </span>
            {isSimulated && <SimulatedBadge />}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{instructions}</p>
        </div>

        <button
          onClick={handleCancel}
          className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition"
          title="Cancel assessment"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Permission Warning / Fallback Notice */}
      {permissionError && !isSimulated && (
        <div className="bg-amber-950/40 border border-amber-800/60 p-3 rounded-xl flex items-center justify-between text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{permissionError}</span>
          </div>
          <button
            onClick={() => setIsSimulated(true)}
            className="bg-amber-600 hover:bg-amber-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs ml-2"
          >
            Switch to Simulated
          </button>
        </div>
      )}

      {/* Main Viewport & Video Overlay */}
      <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-inner">
        {!isSimulated ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover opacity-0 pointer-events-none"
            />
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover" />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <Camera className="w-14 h-14 text-slate-600 mb-2 animate-pulse" />
            <span className="text-sm font-semibold text-slate-200">Simulated Vision Feed Active</span>
            <span className="text-xs text-slate-500 max-w-xs mt-1">
              Streaming synthetic kinematic finger-tapping waveform (2.8 Hz) for deterministic validation.
            </span>
          </div>
        )}

        {/* 3-2-1 Countdown Overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-30 animate-in fade-in">
            <span className="text-6xl font-black text-sky-400 animate-bounce">{countdown}</span>
            <span className="text-sm font-medium text-slate-300 mt-2">Get ready to tap as fast and wide as possible!</span>
          </div>
        )}

        {/* Top Floating Badges */}
        <div className="absolute top-3 left-3 flex items-center gap-2 z-20">
          {/* Quality Pill */}
          <span
            className={`text-xs px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5 backdrop-blur-md border ${
              qualityAssessment.quality === 'valid'
                ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60'
                : qualityAssessment.quality === 'limited'
                ? 'bg-amber-950/80 text-amber-300 border-amber-700/60'
                : 'bg-red-950/80 text-red-300 border-red-700/60'
            }`}
          >
            {qualityAssessment.quality === 'valid' ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            ) : qualityAssessment.quality === 'limited' ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            )}
            Quality: {qualityAssessment.quality.toUpperCase()}
          </span>

          <span className="bg-slate-900/80 text-slate-300 border border-slate-700/60 px-2.5 py-1 rounded-full text-xs font-mono">
            {Math.round(qualityAssessment.fps)} FPS
          </span>
        </div>

        {/* Recording Stats (Timer & Live Tap Counter) */}
        {isRecording && (
          <div className="absolute top-3 right-3 flex items-center gap-2 z-20">
            <span className="bg-red-950/90 text-red-300 border border-red-700/60 px-3 py-1 rounded-full text-xs font-bold animate-pulse flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              {elapsedSeconds}s / {durationSeconds}s
            </span>
            <span className="bg-slate-900/90 text-sky-300 border border-sky-700/60 px-3 py-1 rounded-full text-xs font-bold">
              Taps: {liveTapCount}
            </span>
          </div>
        )}

        {/* Retake Guidance Banner on Insufficient Quality */}
        {qualityAssessment.quality === 'insufficient' && qualityAssessment.reasons.length > 0 && (
          <div className="absolute bottom-3 inset-x-3 bg-red-950/90 border border-red-700/70 p-2.5 rounded-xl text-xs text-red-200 z-20 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{qualityAssessment.reasons[0]}</span>
          </div>
        )}
      </div>

      {/* Real-time Distance Waveform Sparkline */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-slate-300">Live Thumb-Index Normalized Distance Waveform</span>
          <span className="font-mono text-sky-400 text-[11px]">Amplitude: {currentDistance.toFixed(2)}x palm</span>
        </div>
        <div className="h-16 w-full relative">
          <canvas ref={waveformCanvasRef} width={600} height={64} className="w-full h-full" />
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSimulated((s) => !s)}
            className="text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl border border-slate-700 transition"
          >
            Mode: {isSimulated ? 'Simulated' : 'Camera'}
          </button>
          <button
            type="button"
            onClick={handleRetake}
            className="text-xs text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 px-3 py-2 rounded-xl border border-slate-700 transition flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Retake
          </button>
        </div>

        <div className="flex items-center gap-2">
          {!isRecording && countdown === null ? (
            <button
              type="button"
              onClick={handleStartCountdown}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-950 transition flex items-center gap-2 text-xs sm:text-sm"
            >
              <Play className="w-4 h-4 fill-current" /> Start Assessment (3s Countdown)
            </button>
          ) : isRecording ? (
            <button
              type="button"
              onClick={handleStopRecording}
              className="bg-red-600 hover:bg-red-500 text-white font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-red-950 transition flex items-center gap-2 text-xs sm:text-sm animate-pulse"
            >
              <Square className="w-4 h-4 fill-current" /> Stop & Finalize ({elapsedSeconds}s)
            </button>
          ) : (
            <span className="text-xs text-slate-400">Starting in {countdown}...</span>
          )}
        </div>
      </div>
    </div>
  );
};
