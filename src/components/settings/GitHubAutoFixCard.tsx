import React, { useEffect, useState } from 'react';
import { CheckCircle, ExternalLink, Loader2, Unplug, XCircle } from 'lucide-react';
import { api, isApiAvailable } from '../../services/api';

type StatusState =
  | { kind: 'loading' }
  | { kind: 'disconnected' }
  | { kind: 'connected'; login: string; last4: string; scopes: string };

/**
 * Settings card for the Repo Auto-Fix GitHub classic PAT (Phase 8, Task 82).
 *
 * The token is write-only: it lives in a controlled input, is POSTed once,
 * and is cleared from state on success. It is never stored in localStorage.
 */
export const GitHubAutoFixCard: React.FC = () => {
  const [status, setStatus] = useState<StatusState>({ kind: 'loading' });
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isApiAvailable()) return;
    (async () => {
      try {
        const res = await api.settings.githubTokenStatus();
        if (res.connected) {
          setStatus({
            kind: 'connected',
            login: res.github_login || '',
            last4: res.last4 || '',
            scopes: res.scopes || '',
          });
        } else {
          setStatus({ kind: 'disconnected' });
        }
      } catch {
        setStatus({ kind: 'disconnected' });
      }
    })();
  }, []);

  if (!isApiAvailable()) {
    return (
      <div className="space-y-4">
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Connect a classic GitHub personal access token so Repo Auto-Fix can
          scan repositories, generate missing Dockerfiles, fix safe lint errors,
          and open pull requests.
        </p>
        <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl text-[11px] text-zinc-500">
          Available in API mode — connect a backend to use Repo Auto-Fix.
        </div>
        <input type="password" disabled value="" placeholder="ghp_…" aria-label="GitHub token (disabled)"
          className="w-full bg-black/30 border border-white/[0.06] text-zinc-600 placeholder-zinc-700 rounded-md py-2.5 px-3 text-xs font-mono opacity-50 cursor-not-allowed" />
      </div>
    );
  }

  const connect = async () => {
    if (!token.trim()) {
      setError('Paste a classic personal access token first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.settings.saveGithubToken(token.trim());
      setToken(''); // clear the write-only value immediately
      setStatus({ kind: 'connected', login: res.github_login, last4: res.last4, scopes: res.scopes });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the token.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('Remove the stored GitHub token? Auto-Fix will stop working until you reconnect.')) return;
    setBusy(true);
    setError(null);
    try {
      await api.settings.deleteGithubToken();
      setStatus({ kind: 'disconnected' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the token.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <p className="text-[11px] text-zinc-500 leading-relaxed">
        Connect a classic GitHub personal access token (with the{' '}
        <span className="font-mono text-zinc-300">repo</span> scope) so Repo
        Auto-Fix can scan repositories, generate missing Dockerfiles, fix safe
        lint errors, and open pull requests on new branches.
      </p>

      {status.kind === 'loading' && (
        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
          <Loader2 size={13} className="animate-spin" /> Checking connection…
        </div>
      )}

      {status.kind === 'connected' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-emerald-500/[0.06] rounded-xl border border-emerald-500/20">
            <span className="font-semibold text-zinc-200 text-xs flex items-center gap-2">
              <CheckCircle size={14} className="text-emerald-400" />
              Connected as @{status.login}{' '}
              <span className="font-mono text-zinc-400">(…{status.last4})</span>
            </span>
            <button onClick={disconnect} disabled={busy}
              className="text-[11px] text-zinc-400 hover:text-rose-300 border border-white/[0.08] hover:border-rose-500/30 rounded-lg px-3 py-1.5 transition-all flex items-center gap-1.5 disabled:opacity-50">
              <Unplug size={12} /> Disconnect
            </button>
          </div>
          <p className="text-[11px] text-zinc-600 font-mono">Scopes: {status.scopes || '(none reported)'}</p>
        </div>
      )}

      {status.kind === 'disconnected' && (
        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-zinc-400 mb-1.5">
              Classic personal access token
            </label>
            <input type="password" value={token} onChange={e => setToken(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') connect(); }}
              placeholder="ghp_…" autoComplete="off" spellCheck={false}
              className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md py-2.5 px-3 text-xs font-mono" />
          </div>
          <button onClick={connect} disabled={busy}
            className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-5 rounded-lg text-xs transition-all disabled:opacity-50 flex items-center gap-2">
            {busy && <Loader2 size={13} className="animate-spin" />} Connect
          </button>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-rose-300 flex items-center gap-2">
          <XCircle size={13} className="shrink-0" /> {error}
        </p>
      )}

      <a href="https://github.com/settings/tokens/new?scopes=repo&description=aether-autofix"
        target="_blank" rel="noreferrer"
        className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1.5 transition-colors">
        <ExternalLink size={12} /> Create a classic token with the repo scope on GitHub
      </a>
    </div>
  );
};
