import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Activity, Download, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../lib/authContext';
import { networkService } from '../platform';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isOnline, setIsOnline] = useState(true);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    networkService.isOnline().then(setIsOnline);
    const cleanup = networkService.onStatusChange(setIsOnline);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      cleanup();
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <nav className="bg-slate-900 border-b border-slate-800 text-slate-100 px-4 py-3 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-sky-400 font-bold text-xl tracking-tight">
          <Activity className="w-6 h-6 text-sky-400 animate-pulse" />
          <span>NeuroCare</span>
          <span className="text-xs bg-sky-950 text-sky-300 border border-sky-800/60 rounded px-1.5 py-0.5 ml-1 font-mono">
            MED-PS-002
          </span>
        </Link>

        <div className="flex items-center gap-3 sm:gap-4">
          {/* PWA Install Button if available */}
          {deferredPrompt && !isInstalled && (
            <button
              onClick={handleInstallClick}
              className="flex items-center gap-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg border border-sky-400/30 shadow-sm transition"
              title="Install NeuroCare as PWA application"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Install App</span>
            </button>
          )}

          {/* Online/Offline status indicator */}
          <div className="flex items-center gap-1.5 text-xs">
            {isOnline ? (
              <span className="flex items-center gap-1 text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                <Wifi className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Online</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                <WifiOff className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Offline Mode</span>
              </span>
            )}
          </div>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-sm font-medium text-slate-200">{user.full_name}</div>
                <div className="text-xs text-slate-400 capitalize flex items-center justify-end gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${user.role === 'doctor' ? 'bg-sky-400' : 'bg-emerald-400'}`} />
                  {user.role} View
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-lg border border-slate-700 transition"
                title="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              to="/login"
              className="bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
            >
              Sign In
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
};
