import React from 'react';
import { Database } from 'lucide-react';

export const SimulatedBadge: React.FC<{ className?: string }> = ({ className = '' }) => {
  return (
    <span
      title="This dataset contains synthetic or simulated clinical data for demonstration and testing purposes."
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 ${className}`}
    >
      <Database className="w-3 h-3" />
      SIMULATED DATA
    </span>
  );
};
