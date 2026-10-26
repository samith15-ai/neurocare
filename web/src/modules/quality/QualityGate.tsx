import React from 'react';
import { Sun, Video, UserCheck, Mic, CheckCircle2, AlertCircle } from 'lucide-react';
import type { QualityGateState } from '../../types';

interface QualityGateProps {
  state: QualityGateState;
}

export const QualityGate: React.FC<QualityGateProps> = ({ state }) => {
  const items = [
    {
      label: 'Lighting & Contrast',
      ok: state.lighting_ok,
      icon: Sun,
      value: state.current_luma !== undefined ? `${Math.round(state.current_luma)}%` : undefined,
      hint: 'Ensure your face is well-lit from the front, avoid backlights.',
    },
    {
      label: 'Facial Visibility',
      ok: state.framing_ok,
      icon: Video,
      hint: 'Face directly forward towards the camera at eye level.',
    },
    {
      label: 'Postural Framing',
      ok: state.framing_ok,
      icon: UserCheck,
      hint: 'Upper torso and hands visible in the frame.',
    },
    {
      label: 'Acoustic Quality (SNR)',
      ok: state.audio_snr_ok,
      icon: Mic,
      value: state.current_snr !== undefined ? `${Math.round(state.current_snr)} dB` : undefined,
      hint: 'Quiet room with low background noise (>14 dB SNR).',
    },
  ];

  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3 border-b border-slate-800/80 pb-2">
        <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          Quality Gate Status
          <span className="text-xs font-normal text-slate-400">(Quality is not pathology)</span>
        </h4>
        <div className="flex items-center gap-1.5">
          {state.passed ? (
            <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Ready for Recording
            </span>
          ) : (
            <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> Adjustments Required
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        {items.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              className={`p-2 rounded-lg border text-xs transition ${
                item.ok
                  ? 'bg-slate-800/40 border-slate-700 text-slate-300'
                  : 'bg-amber-950/20 border-amber-800/50 text-amber-200'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold flex items-center gap-1">
                  <Icon className={`w-3.5 h-3.5 ${item.ok ? 'text-emerald-400' : 'text-amber-400'}`} />
                  {item.label}
                </span>
                {item.ok ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                )}
              </div>
              {item.value && <div className="text-slate-400 font-mono text-[11px]">{item.value}</div>}
            </div>
          );
        })}
      </div>

      {state.guidance && !state.passed && (
        <div className="text-xs text-amber-300 bg-amber-950/40 border border-amber-800/60 p-2 rounded-lg mt-2 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-400 mt-0.5" />
          <span>{state.guidance}</span>
        </div>
      )}
    </div>
  );
};
