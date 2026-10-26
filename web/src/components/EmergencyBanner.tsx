import React from 'react';
import { AlertTriangle, PhoneCall } from 'lucide-react';

interface EmergencyBannerProps {
  visible: boolean;
  message?: string;
  onDismiss?: () => void;
}

export const EmergencyBanner: React.FC<EmergencyBannerProps> = ({
  visible,
  message = 'CRITICAL HEALTH ALERT: Potential acute stroke or neurological symptoms detected (FAST Criteria). Seek emergency medical attention immediately.',
  onDismiss,
}) => {
  if (!visible) return null;

  return (
    <div
      role="alert"
      className="bg-red-600 text-white px-4 py-3 shadow-lg border-b-2 border-red-800 flex flex-col md:flex-row items-center justify-between gap-3 sticky top-0 z-50 animate-pulse"
    >
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-8 h-8 flex-shrink-0 text-amber-300" />
        <div>
          <span className="font-bold uppercase tracking-wider text-sm block">Emergency Clinical Alert</span>
          <p className="text-sm font-medium">{message}</p>
          <span className="text-xs text-red-100 italic">Do not wait for further assessments or scheduled visits. Call emergency services immediately.</span>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <a
          href="tel:911"
          className="bg-white text-red-700 hover:bg-red-50 font-bold px-4 py-2 rounded-lg flex items-center gap-2 text-sm shadow transition"
        >
          <PhoneCall className="w-4 h-4" />
          Call 911 / EMS Now
        </a>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-white hover:text-red-200 text-xs px-2 py-1 underline"
          >
            Acknowledge
          </button>
        )}
      </div>
    </div>
  );
};
