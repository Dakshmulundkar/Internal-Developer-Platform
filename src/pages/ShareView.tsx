import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { AlertTriangle, ArrowLeft, Lock } from 'lucide-react';

/* ── helpers ───────────────────────────────────────────────────────────────── */

function parseLocation() {
  const m = window.location.pathname.match(/^\/share\/([\w-]+)\/([\w-]+)$/);
  const entityType = m?.[1];
  const entityId    = m?.[2];
  const token       = new URLSearchParams(window.location.search).get('token');
  return { entityType, entityId, token };
}

function severityColor(severity: string) {
  if (severity === 'critical') return 'bg-red-500/20 text-red-400';
  if (severity === 'major' || severity === 'high') return 'bg-orange-500/20 text-orange-400';
  if (severity === 'minor' || severity === 'medium') return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-emerald-500/20 text-emerald-400';
}

function statusBadge(status: string) {
  if (status === 'resolved' || status === 'completed') return 'bg-emerald-500/20 text-emerald-400';
  if (status === 'open' || status === 'in_progress') return 'bg-red-500/20 text-red-400';
  if (status === 'pending' || status === 'queued') return 'bg-yellow-500/20 text-yellow-400';
  return 'bg-white/10 text-white/60';
}

/** Helper to safely coerce an unknown entity field to a displayable string. */
function str(e: Record<string, unknown>, key: string): string {
  const v = e[key];
  if (v === null || v === undefined) return '';
  return String(v);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-white/40 mb-1">{label}</div>
      <div className="text-sm text-white/80">{children}</div>
    </div>
  );
}

/* ── entity cards ──────────────────────────────────────────────────────────── */

function IncidentView({ entity: e }: { entity: Record<string, unknown> }) {
  const severity = str(e, 'severity');
  const status   = str(e, 'status');
  const createdAt = str(e, 'created_at');
  const updatedAt = str(e, 'updated_at');

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-white/90">{str(e, 'title') || str(e, 'id')}</span>
        {severity && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${severityColor(severity)}`}>
            {severity.toUpperCase()}
          </span>
        )}
        {status && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusBadge(status)}`}>
            {status}
          </span>
        )}
      </div>
      {str(e, 'description') && (
        <p className="mt-4 text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{str(e, 'description')}</p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Field label="Source">{str(e, 'source')}</Field>
        <Field label="Assignee">{str(e, 'assignee')}</Field>
        <Field label="Created">{createdAt ? new Date(createdAt).toLocaleString() : '—'}</Field>
        <Field label="Updated">{updatedAt ? new Date(updatedAt).toLocaleString() : '—'}</Field>
        {str(e, 'impact') && <Field label="Impact">{str(e, 'impact')}</Field>}
        {str(e, 'environment') && <Field label="Environment">{str(e, 'environment')}</Field>}
      </div>
    </>
  );
}

function DeploymentView({ entity: e }: { entity: Record<string, unknown> }) {
  const status     = str(e, 'status');
  const version    = str(e, 'version');
  const createdAt  = str(e, 'created_at');
  const deployedAt = str(e, 'deployed_at');

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-white/90">{str(e, 'name') || str(e, 'id')}</span>
        {status && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusBadge(status)}`}>
            {status}
          </span>
        )}
        {version && (
          <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-500/20 text-blue-400">
            v{version}
          </span>
        )}
      </div>
      {str(e, 'description') && (
        <p className="mt-4 text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{str(e, 'description')}</p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Field label="Environment">{str(e, 'environment')}</Field>
        <Field label="Pipeline ID">{str(e, 'pipeline_id')}</Field>
        <Field label="Created">{createdAt ? new Date(createdAt).toLocaleString() : '—'}</Field>
        <Field label="Deployed At">{deployedAt ? new Date(deployedAt).toLocaleString() : '—'}</Field>
        {str(e, 'commit_sha') && <Field label="Commit">{str(e, 'commit_sha')}</Field>}
        {str(e, 'deployed_by') && <Field label="Deployed by">{str(e, 'deployed_by')}</Field>}
      </div>
    </>
  );
}

function ProjectView({ entity: e }: { entity: Record<string, unknown> }) {
  const status    = str(e, 'status');
  const createdAt = str(e, 'created_at');
  const updatedAt = str(e, 'updated_at');

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-white/90">{str(e, 'name')}</span>
        {status && (
          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusBadge(status)}`}>
            {status}
          </span>
        )}
      </div>
      {str(e, 'description') && (
        <p className="mt-4 text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{str(e, 'description')}</p>
      )}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Field label="Environment">{str(e, 'environment')}</Field>
        <Field label="Created">{createdAt ? new Date(createdAt).toLocaleString() : '—'}</Field>
        <Field label="Updated">{updatedAt ? new Date(updatedAt).toLocaleString() : '—'}</Field>
      </div>
    </>
  );
}

/* ── main page ─────────────────────────────────────────────────────────────── */

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; entityType: string; entity: Record<string, unknown> };

export function ShareView() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  const loadShared = useCallback(async (pw?: string) => {
    const { entityType: type, entityId: id, token: tok } = parseLocation();
    if (!type || !id || !tok) {
      setState({ status: 'loading' });
      setState({ status: 'error', message: 'Invalid share link — missing parameters.' });
      return;
    }
    setToken(tok);
    try {
      const res = await api.sharing.public(type, id, tok, pw);
      setNeedsPassword(false);
      setState({ status: 'ok', entityType: res.entity_type, entity: res.entity as Record<string, unknown> });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('password')) {
        if (pw) {
          setPasswordError('Incorrect password. Please try again.');
        } else {
          setNeedsPassword(true);
        }
        setState({ status: 'loading' });
        return;
      }
      setNeedsPassword(false);
      setState({
        status: 'error',
        message: msg.includes('410')
          ? 'This share link has expired.'
          : msg.includes('revoked')
          ? 'This share link has been revoked.'
          : msg || 'Failed to load shared content.',
      });
    }
  }, []);

  useEffect(() => {
    loadShared();
  }, [loadShared]);

  if (needsPassword) {
    return (
      <div className="h-screen w-screen bg-[#050505] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <Lock className="w-8 h-8 text-yellow-400 mx-auto mb-4" />
          <p className="text-white/80 text-sm mb-4">This share link is password protected.</p>
          {passwordError && (
            <p className="text-red-400 text-xs mb-3">{passwordError}</p>
          )}
          <input
            type="password"
            value={password}
            onChange={e => { setPassword(e.target.value); setPasswordError(''); }}
            onKeyDown={e => { if (e.key === 'Enter') loadShared(password); }}
            placeholder="Enter password"
            autoFocus
            className="w-full bg-black/30 border border-white/10 text-zinc-100 placeholder-zinc-600 focus:border-yellow-400/40 focus:outline-none rounded-md py-2.5 px-4 text-sm mb-4"
          />
          <div className="flex gap-2">
            <button
              onClick={() => loadShared(password)}
              className="flex-1 rounded-lg bg-yellow-400 text-black text-xs font-semibold px-4 py-2.5 hover:bg-yellow-300 transition"
            >
              Unlock
            </button>
            <button
              onClick={() => window.location.assign('/')}
              className="flex-1 rounded-lg bg-white/10 text-white/70 text-xs font-medium px-4 py-2.5 hover:bg-white/20 transition"
            >
              Back to application
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === 'loading') {
    return (
      <div className="h-screen w-screen bg-[#050505] flex items-center justify-center">
        <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="h-screen w-screen bg-[#050505] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
          <AlertTriangle className="w-8 h-8 text-yellow-400 mx-auto mb-4" />
          <p className="text-white/80 text-sm">{state.message}</p>
          <button
            onClick={() => window.location.assign('/')}
            className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white/70 text-xs font-medium hover:bg-white/20 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to application
          </button>
        </div>
      </div>
    );
  }

  const { entityType, entity } = state;
  const typeLabel  = entityType === 'incident' ? 'Incident' : entityType === 'deployment' ? 'Deployment' : 'Project';
  const entityName = str(entity, 'name') || str(entity, 'title') || 'Shared resource';

  return (
    <div className="min-h-screen bg-[#050505] p-6">
      <div className="w-full max-w-3xl mx-auto mb-6">
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span className="font-medium text-white/50 tracking-wide uppercase">AETHER IDP</span>
          <span className="opacity-40">—</span>
          <span>{typeLabel} shared view</span>
        </div>
      </div>

      <div className="w-full max-w-3xl mx-auto rounded-xl border border-white/10 bg-white/[0.03] p-6">
        <Field label="Name">{entityName}</Field>
        <div className="mt-6">
          {entityType === 'incident'   && <IncidentView   entity={entity} />}
          {entityType === 'deployment' && <DeploymentView entity={entity} />}
          {entityType === 'project'    && <ProjectView    entity={entity} />}
        </div>

        <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-white/30">
          <span>Read-only shared link — expires if configured</span>
          {token && <span className="font-mono opacity-50">{token.slice(0, 8)}…</span>}
        </div>
      </div>
    </div>
  );
}

export default ShareView;
