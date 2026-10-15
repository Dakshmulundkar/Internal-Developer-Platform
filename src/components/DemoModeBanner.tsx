import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { API_BASE, isApiAvailable } from '../services/api';

type BannerKind = 'demo' | 'unreachable';

/**
 * Top strip that keeps the UI honest about backend connectivity.
 *
 * - "demo":       VITE_USE_API and VITE_API_URL both unset → all data is seed
 *                 sample data, nothing is real.
 * - "unreachable": env is configured but /health failed at page load (backend
 *                 down / proxy error).
 *
 * Dismissal lasts for the session only (plain state — returns on reload).
 */
export const DemoModeBanner: React.FC = () => {
  const [kind, setKind] = useState<BannerKind | null>(() =>
    isApiAvailable() ? null : 'demo',
  );
  const [dismissed, setDismissed] = useState(false);

  // Probe /health once at load, only when the API is configured.
  useEffect(() => {
    if (!isApiAvailable() || kind !== null) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    fetch(`${API_BASE}/health`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) setKind('unreachable');
      })
      .catch(() => setKind('unreachable'))
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [kind]);

  if (dismissed || !kind) return null;

  const isDemo = kind === 'demo';

  return (
    <div
      role="status"
      className={`flex items-center justify-between gap-3 border-b px-4 py-1.5 text-xs ${
        isDemo
          ? 'border-zinc-700 bg-zinc-800/80 text-zinc-300'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-400'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <AlertTriangle size={13} className="shrink-0" />
        {isDemo ? (
          <span className="truncate">
            Demo mode: you&apos;re viewing sample data. Connect a backend — see
            Quick Start in the README.
          </span>
        ) : (
          <span className="truncate">
            Backend unreachable — check{' '}
            <code className="rounded bg-black/30 px-1 py-0.5 font-mono">
              npm run doctor
            </code>
            .
          </span>
        )}
      </span>
      <button
        type="button"
        aria-label="Dismiss banner"
        onClick={() => setDismissed(true)}
        className={`shrink-0 transition-colors ${
          isDemo
            ? 'text-zinc-500 hover:text-zinc-200'
            : 'text-amber-500/70 hover:text-amber-300'
        }`}
      >
        <X size={14} />
      </button>
    </div>
  );
};
