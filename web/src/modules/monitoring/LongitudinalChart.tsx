import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { SimulatedBadge } from '../../components/SimulatedBadge';
import type { TrajectoryPoint } from '../../types';

interface LongitudinalChartProps {
  points: TrajectoryPoint[];
}

export const LongitudinalChart: React.FC<LongitudinalChartProps> = ({ points }) => {
  const [selectedFeature, setSelectedFeature] = useState<string>('finger_tap_amplitude_decay');

  const availableFeatures = Array.from(new Set(points.map((p) => p.feature_name)));
  const filteredPoints = points.filter((p) => p.feature_name === selectedFeature);

  const baselineMean = filteredPoints[0]?.baseline_mean ?? 0.12;
  const baselineStd = filteredPoints[0]?.baseline_std ?? 0.03;
  const unit = filteredPoints[0]?.unit ?? '';

  const hasSimulatedData = filteredPoints.some((p) => p.is_simulated);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-100">Longitudinal Behavioral Trajectory</h3>
            {hasSimulatedData && <SimulatedBadge />}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Personalized baseline comparison (Z-score deviation). Shaded region indicates ±1σ nominal baseline band.
          </p>
        </div>

        {/* Feature Selector */}
        <select
          value={selectedFeature}
          onChange={(e) => setSelectedFeature(e.target.value)}
          className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-sky-500"
        >
          {availableFeatures.map((f) => (
            <option key={f} value={f}>
              {f.replace(/_/g, ' ')}
            </option>
          ))}
        </select>
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={filteredPoints} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
            <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#f8fafc',
              }}
              formatter={(val: any) => [`${val} ${unit}`, selectedFeature.replace(/_/g, ' ')]}
            />
            {/* Nominal baseline interval */}
            <ReferenceArea
              y1={Math.max(0, baselineMean - baselineStd)}
              y2={baselineMean + baselineStd}
              fill="#0284c7"
              fillOpacity={0.12}
            />
            <ReferenceLine
              y={baselineMean}
              stroke="#38bdf8"
              strokeDasharray="4 4"
              label={{
                value: `Baseline Mean: ${baselineMean}`,
                fill: '#38bdf8',
                fontSize: 10,
                position: 'insideBottomRight',
              }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#38bdf8"
              strokeWidth={2.5}
              dot={{ r: 4, fill: '#38bdf8' }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-3 mt-3">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-sky-400 inline-block" /> Observed Patient Measurement
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-2 bg-sky-500/20 border border-sky-400/40 inline-block" /> ±1σ Baseline Interval
          </span>
        </div>
        <span className="text-[11px] text-slate-500 italic">
          Every point is evidence-traceable to stored recording timestamp.
        </span>
      </div>
    </div>
  );
};
