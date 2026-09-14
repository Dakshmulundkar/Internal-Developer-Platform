import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { timeAgo } from '../hooks/useDragReorder';
import {
  Activity, AlertTriangle, ArrowRight, Ban, CheckCircle2, ChevronDown,
  ChevronUp, Clock3, ExternalLink, GitBranch, Layers, Loader2, PlayCircle,
  Plus, RefreshCw, RotateCcw, Search, Server, ShieldCheck, Terminal, TrendingUp, User, XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import type { Deployment, DeploymentStatus, Project } from '../types/platform';
import { PipelineStageBar } from '../components/PipelineStageBar';

/* ─────────────────────────────────────────────────────────────────────────────
   Status metadata — maps the platform status model onto Jenkins-style labels
───────────────────────────────────────────────────────────────────────────── */

type DeployStage = NonNullable<Deployment['stages']>[number];

const STATUS_META: Record<
  DeploymentStatus,
  { label: string; short: string; chip: string; dot: string; iconBox: string }
> = {
  queued: {
    label: 'Queued', short: 'QUEUED',
    chip: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    dot: 'bg-amber-400',
    iconBox: 'border-amber-500/20 bg-amber-500/10',
  },
  building: {
    label: 'Running', short: 'RUNNING',
    chip: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    dot: 'bg-blue-400',
    iconBox: 'border-blue-500/20 bg-blue-500/10',
  },
  ready: {
    label: 'Success', short: 'SUCCESS',
    chip: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    dot: 'bg-emerald-400',
    iconBox: 'border-emerald-500/20 bg-emerald-500/10',
  },
  failed: {
    label: 'Failed', short: 'FAILED',
    chip: 'bg-red-500/10 text-red-400 border-red-500/20',
    dot: 'bg-red-400',
    iconBox: 'border-red-500/20 bg-red-500/10',
  },
  canceled: {
    label: 'Aborted', short: 'ABORTED',
    chip: 'bg-white/5 text-zinc-400 border-white/[0.08]',
    dot: 'bg-zinc-400',
    iconBox: 'border-white/10 bg-white/[0.03]',
  },
  rolled_back: {
    label: 'Rolled Back', short: 'ROLLED BACK',
    chip: 'bg-purple-500/10 text-purple-400 border-purple-500/25',
    dot: 'bg-purple-400',
    iconBox: 'border-purple-500/25 bg-purple-500/10',
  },
};

const STAGE_DOT_CLASS: Record<DeployStage['status'], string> = {
  success: 'bg-emerald-400',
  failed: 'bg-red-400',
  running: 'bg-blue-400 animate-pulse',
  pending: 'bg-zinc-600',
};

const STAGE_TEXT_CLASS: Record<DeployStage['status'], string> = {
  success: 'text-emerald-400',
  failed: 'text-red-400',
  running: 'text-blue-400',
  pending: 'text-zinc-500',
};

const STATUS_ICONS: Record<DeploymentStatus, LucideIcon> = {
  queued: Clock3,
  building: Loader2,
  ready: CheckCircle2,
  failed: XCircle,
  canceled: Ban,
  rolled_back: RotateCcw,
};

const DEFAULT_STAGES: DeployStage[] = [
  { name: 'Build', status: 'pending', durationMs: 0 },
  { name: 'Test', status: 'pending', durationMs: 0 },
  { name: 'Security', status: 'pending', durationMs: 0 },
  { name: 'Deploy', status: 'pending', durationMs: 0 },
];

const ENV_ORDER = ['production', 'staging', 'preview', 'development', 'dev', 'qa'];

/* ─────────────────────────────────────────────────────────────────────────────
   Static helpers
───────────────────────────────────────────────────────────────────────────── */

function StatusGlyph({ status, size = 16, className = '' }: { status: DeploymentStatus; size?: number; className?: string }) {
  const Icon = STATUS_ICONS[status] || Clock3;
  return (
    <Icon
      size={size}
      className={`${STATUS_META[status].chip.split(' ')[1]} ${className}${status === 'building' ? ' animate-spin' : ''}`}
    />
  );
}

function fmtDur(ms: number | undefined | null): string {
  if (!ms || ms <= 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function StatusChip({ status }: { status: DeploymentStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[9px] font-bold font-mono px-2 py-0.5 rounded-full border uppercase tracking-wide ${m.chip}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot} ${status === 'building' ? 'animate-pulse' : ''}`} />
      {m.short}
    </span>
  );
}

function WeatherDots({ builds }: { builds: Deployment[] }) {
  const recent = builds.slice(0, 12).reverse();
  if (recent.length === 0) return <span className="text-[9px] text-zinc-700">no builds</span>;
  return (
    <div className="flex items-center gap-[3px]">
      {recent.map((b, i) => (
        <span
          key={i}
          title={`${b.version} — ${STATUS_META[b.status].label}`}
          className={`w-2 h-2 rounded-sm ${STATUS_META[b.status].dot} ${b.status === 'building' ? 'animate-pulse' : ''}`}
        />
      ))}
    </div>
  );
}

function Elapsed({ createdAt }: { createdAt: string }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick(t => t + 1), 5000);
    return () => clearInterval(i);
  }, []);
  return <>{fmtDur(Date.now() - new Date(createdAt).getTime())}</>;
}

function SectionTitle({ icon: Icon, title, sub, right }: {
  icon: LucideIcon;
  title: string; sub?: string; right?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-400">
        <Icon size={13} />
      </div>
      <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">{title}</h4>
      {sub && <span className="text-[10px] font-mono text-zinc-500">{sub}</span>}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Rollback modal — pick a stable archive deployment and redirect traffic
───────────────────────────────────────────────────────────────────────────── */

function RollbackModal({ deployment, onClose }: {
  deployment: Deployment;
  onClose: () => void;
}) {
  const { deployments, rollbackOperations, startRollback, navigateTo } = usePlatform();

  const candidates = useMemo(
    () => deployments
      .filter(d => d.projectId === deployment.projectId && d.id !== deployment.id && (d.status === 'ready' || d.status === 'rolled_back'))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [deployments, deployment],
  );

  const activeRollback = useMemo(
    () => rollbackOperations.find(r => r.projectId === deployment.projectId && (r.status === 'queued' || r.status === 'in_progress')),
    [rollbackOperations, deployment],
  );

  const [targetId, setTargetId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const selected = candidates.find(c => c.id === targetId);

  const confirm = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError('');
    try {
      await startRollback(deployment.projectId, selected.id);
      setDone(true);
    } catch {
      setError('Rollback failed to initialize. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <RotateCcw size={14} className="text-purple-400" /> Rollback {deployment.projectName}
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5 font-mono">
              {deployment.version} · {deployment.commitHash} · {timeAgo(deployment.createdAt)}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200 text-lg leading-none">×</button>
        </div>

        {done ? (
          <div className="p-6 space-y-4">
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 flex items-start gap-2.5 text-xs">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-emerald-400 block mb-0.5">Rollback initiated</span>
                <span className="text-zinc-400 leading-relaxed">
                  Traffic is being redirected to {selected?.version} ({selected?.commitHash}). Track the live audit trail in the Recovery Center.
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { onClose(); navigateTo('rollback-recovery'); }}
                className="flex-1 bg-white text-black hover:bg-zinc-200 font-medium py-2 rounded-lg text-xs flex items-center justify-center gap-1.5"
              >
                Open Recovery Center <ArrowRight size={13} />
              </button>
              <button onClick={onClose} className="px-4 py-2 rounded-lg border border-white/[0.08] hover:bg-white/[0.04] text-zinc-300 text-xs">
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="bg-amber-500/5 border border-amber-500/20 p-4 rounded-lg flex items-start gap-2.5 text-xs text-amber-400">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-white block mb-0.5">Destructive Infrastructure Redirection</span>
                <span className="leading-relaxed text-zinc-400">
                  This overrides the active production routing for this service. Confirm the stability of the target archive before proceeding.
                </span>
              </div>
            </div>

            {activeRollback && (
              <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-[11px] text-blue-300">
                <Loader2 size={12} className="inline animate-spin mr-1.5" />
                A rollback for this service is already in progress — actions are disabled until it completes.
              </div>
            )}

            {candidates.length === 0 ? (
              <div className="py-10 text-center text-xs text-zinc-500 border border-dashed border-white/[0.08] rounded-lg">
                No stable archive deployments found for this service.
              </div>
            ) : (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                  Target stable version
                </div>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {candidates.map(c => (
                    <button
                      key={c.id}
                      disabled={!!activeRollback}
                      onClick={() => setTargetId(c.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border transition-all disabled:opacity-50 ${
                        targetId === c.id
                          ? 'border-white/25 bg-white/[0.06]'
                          : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-zinc-200 font-mono">{c.version}</span>
                        <span className="text-[9px] font-mono text-zinc-500">{timeAgo(c.createdAt)}</span>
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-0.5 truncate font-mono">
                        {c.commitHash} · {c.commitMessage}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-[11px] text-red-400 flex items-center gap-2">
                <AlertTriangle size={13} /> {error}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-white/[0.08] hover:bg-white/[0.04] text-zinc-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                onClick={confirm}
                disabled={!selected || busy || !!activeRollback}
                className="flex-1 bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed font-medium py-2 rounded-lg text-xs transition-all flex items-center justify-center gap-1.5"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                {busy ? 'Redirecting traffic...' : `Rollback to ${selected?.version || 'version'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Build run drill-down — stages, console output, linked incidents
───────────────────────────────────────────────────────────────────────────── */

function BuildDrillDown({ deployment }: { deployment: Deployment }) {
  const { incidents, securityIncidents, navigateTo } = usePlatform();
  const stages = deployment.stages && deployment.stages.length > 0 ? deployment.stages : DEFAULT_STAGES;
  const logs = deployment.logs && deployment.logs.length > 0 ? deployment.logs : ['No console output captured for this build.'];

  const linked = useMemo(
    () => [...incidents, ...securityIncidents]
      .filter(i => i.deploymentId === deployment.id)
      .slice(0, 4),
    [incidents, securityIncidents, deployment.id],
  );

  return (
    <div className="border-t border-white/[0.06] bg-black/20 px-4 py-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Stages
          </div>
          <div className="space-y-1.5">
            {stages.map((st, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${STAGE_DOT_CLASS[st.status]}`} />
                <span className="flex-1 text-[11px] text-zinc-300 truncate">{st.name}</span>
                <span className="text-[9px] font-mono text-zinc-600">{fmtDur(st.durationMs)}</span>
                <span className={`text-[9px] font-bold uppercase w-14 text-right ${STAGE_TEXT_CLASS[st.status]}`}>
                  {st.status}
                </span>
              </div>
            ))}
          </div>

          {deployment.errorMessage && (
            <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3 flex items-start gap-2 text-[11px] text-red-300">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="font-mono leading-relaxed">{deployment.errorMessage}</span>
            </div>
          )}

          {linked.length > 0 && (
            <div className="mt-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
                Linked Incidents ({linked.length})
              </div>
              <div className="space-y-1.5">
                {linked.map(inc => (
                  <button
                    key={inc.id}
                    onClick={() => navigateTo('incidents', { incidentId: inc.id })}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-500/15 bg-rose-500/5 hover:bg-rose-500/10 text-[11px] text-rose-300 text-left transition-all"
                  >
                    <AlertTriangle size={12} className="shrink-0" />
                    <span className="flex-1 truncate">{inc.title}</span>
                    <ArrowRight size={11} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Console Output</div>
            <span className="text-[9px] font-mono text-zinc-600">{logs.length} lines</span>
          </div>
          <pre className="bg-black/40 border border-white/[0.06] rounded-lg p-3 text-[10px] font-mono text-zinc-400 leading-relaxed overflow-x-auto max-h-56 whitespace-pre-wrap">
            {logs.map((l, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-zinc-700 select-none">{String(i + 1).padStart(2, '0')}</span>
                <span>{l}</span>
              </div>
            ))}
          </pre>

          {deployment.url && (
            <a
              href={deployment.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 font-medium"
            >
              <Terminal size={12} /> Open live deployment <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Build run row
───────────────────────────────────────────────────────────────────────────── */

function BuildRow({ deployment, activeRollbacks, expanded, onToggle, onRollback, onRestart }: {
  deployment: Deployment;
  activeRollbacks: string[];
  expanded: boolean;
  onToggle: () => void;
  onRollback: () => void;
  onRestart: () => void;
}) {
  const { rollbackOperations, incidents, securityIncidents, monitoringAlerts } = usePlatform();

  const rollbackRef = useMemo(
    () => rollbackOperations.find(r => r.failedDeploymentId === deployment.id || r.targetDeploymentId === deployment.id),
    [rollbackOperations, deployment.id],
  );
  const incidentsCount = incidents.filter(i => i.deploymentId === deployment.id).length
    + securityIncidents.filter(i => i.deploymentId === deployment.id).length;
  const alertsCount = monitoringAlerts.filter(a => a.deploymentId === deployment.id).length;
  const canRollback = deployment.status === 'failed';
  const canRestart = deployment.status === 'failed' || deployment.status === 'canceled' || deployment.status === 'rolled_back';
  const projectBusy = activeRollbacks.includes(deployment.projectId);

  return (
    <div className={`bg-white/[0.03] border rounded-xl overflow-hidden transition-all ${
      expanded ? 'border-white/15' : 'border-white/[0.06] hover:border-white/15'
    }`}>
      <div onClick={onToggle} className="p-4 flex items-center gap-4 cursor-pointer">
        {/* Status glyph */}
        <div className={`w-10 h-10 rounded-full border flex items-center justify-center shrink-0 ${STATUS_META[deployment.status].iconBox}`}>
          <StatusGlyph status={deployment.status} size={18} />
        </div>

        {/* Identity */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white truncate">{deployment.projectName}</span>
            <span className="text-[9px] font-mono font-bold bg-white/5 border border-white/[0.06] px-1.5 py-0.5 rounded text-zinc-400">
              {deployment.version}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-zinc-500 font-mono">
              <GitBranch size={10} /> {deployment.branch}
            </span>
            <StatusChip status={deployment.status} />
            {canRollback && rollbackRef && (
              <span className="text-[9px] font-bold uppercase font-mono px-2 py-0.5 rounded-full border border-purple-500/25 bg-purple-500/10 text-purple-400">
                Restored target
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-400 mt-1 truncate font-mono">
            <span className="text-zinc-500">{deployment.commitHash}</span>
            <span className="text-zinc-700 mx-1.5">›</span>
            {deployment.commitMessage}
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-500">
            <span className="flex items-center gap-1.5">
              {deployment.authorAvatar ? (
                <img src={deployment.authorAvatar} alt="" className="w-4 h-4 rounded-full border border-white/10" />
              ) : (
                <User size={11} className="text-zinc-600" />
              )}
              {deployment.author}
            </span>
            <span className="text-zinc-700">•</span>
            <span>{timeAgo(deployment.createdAt)}</span>
            <span className="flex items-center gap-1"><Clock3 size={10} /> {fmtDur(deployment.durationMs)}</span>
            {incidentsCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border border-rose-500/20 bg-rose-500/10 text-rose-400">
                <AlertTriangle size={9} /> {incidentsCount} incident{incidentsCount > 1 ? 's' : ''}
              </span>
            )}
            {alertsCount > 0 && (
              <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border border-amber-500/20 bg-amber-500/10 text-amber-400">
                {alertsCount} alert{alertsCount > 1 ? 's' : ''}
              </span>
            )}
            {rollbackRef && rollbackRef.status === 'queued' && <span className="text-blue-400 animate-pulse font-mono">rollback running…</span>}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {deployment.url && (
            <a
              href={deployment.url}
              target="_blank"
              rel="noopener noreferrer"
              title="Open live deployment"
              className="p-2 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04] transition-all"
            >
              <ExternalLink size={14} />
            </a>
          )}
          {canRestart && (
            <button
              onClick={onRestart}
              title="Restart build"
              className="p-2 rounded-lg text-zinc-500 hover:text-blue-300 hover:bg-white/[0.04] transition-all"
            >
              <PlayCircle size={15} />
            </button>
          )}
          {canRollback && (
            <button
              onClick={onRollback}
              disabled={projectBusy}
              title={projectBusy ? 'Rollback already in progress' : 'Rollback to stable version'}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-semibold font-mono text-red-400 border border-red-500/25 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <RotateCcw size={12} /> Rollback
            </button>
          )}
          <span className="text-zinc-600">
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </div>
      </div>

      {/* Pipeline stage strip — always visible on every screen size */}
      <div className="px-4 pt-3 pb-4 border-t border-white/[0.06] flex items-center gap-3">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-zinc-600 shrink-0">Pipeline</span>
        <div className="overflow-x-auto flex-1 min-w-0 pb-0.5">
          <PipelineStageBar
            stages={deployment.stages}
            deploymentStatus={deployment.status}
            commitHash={deployment.commitHash}
            commitMessage={deployment.commitMessage}
          />
        </div>
      </div>

      {expanded && <BuildDrillDown deployment={deployment} />}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Main page
───────────────────────────────────────────────────────────────────────────── */

export const PipelineCenter: React.FC = () => {
  const {
    projects, deployments, rollbackOperations, triggerWebhookSimulation, refreshData, navigateTo,
  } = usePlatform();

  const [scopeId, setScopeId] = useState<string | null>(null);
  const [filters, setFilters] = useState<{ q: string; status: string; platform: string }>({ q: '', status: 'all', platform: 'all' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [shown, setShown] = useState(20);
  const [rollbackDep, setRollbackDep] = useState<Deployment | null>(null);
  const [newBuildOpen, setNewBuildOpen] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  /* ── derived ── */
  const sorted = useMemo(
    () => [...deployments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [deployments],
  );

  const activeRollbackProjects = useMemo(
    () => rollbackOperations.filter(r => r.status === 'queued' || r.status === 'in_progress').map(r => r.projectId),
    [rollbackOperations],
  );

  const total = deployments.length;
  const successCount = deployments.filter(d => d.status === 'ready').length;
  const failedCount = deployments.filter(d => d.status === 'failed').length;
  const runningCount = deployments.filter(d => d.status === 'building').length;
  const successRate = total > 0 ? Math.round((successCount / total) * 100) : 0;
  const avgDur = deployments.length
    ? deployments.reduce((acc, d) => acc + (d.durationMs || 0), 0) / deployments.length
    : 0;

  const pipelines = useMemo(
    () => projects.map(p => {
      const builds = sorted.filter(d => d.projectId === p.id);
      const ok = builds.filter(d => d.status === 'ready').length;
      return {
        project: p, builds, count: builds.length,
        rate: builds.length ? Math.round((ok / builds.length) * 100) : 0,
        latest: builds[0] || null,
      };
    }),
    [projects, sorted],
  );

  const trend = useMemo(() => {
    const days = 14;
    const slots: { key: string; label: string; success: number; failed: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      slots.push({ key: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), success: 0, failed: 0 });
    }
    for (const d of deployments) {
      const key = (d.createdAt || '').slice(0, 10);
      const slot = slots.find(s => s.key === key);
      if (!slot) continue;
      if (d.status === 'ready') slot.success++;
      else if (d.status === 'failed') slot.failed++;
    }
    return slots;
  }, [deployments]);

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    return sorted.filter(d => {
      if (scopeId && d.projectId !== scopeId) return false;
      if (filters.status !== 'all' && d.status !== filters.status) return false;
      if (filters.platform !== 'all' && d.provider !== filters.platform) return false;
      if (q) {
        const hay = `${d.projectName} ${d.commitHash} ${d.commitMessage} ${d.branch} ${d.author}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [sorted, scopeId, filters]);

  const queue = sorted.filter(d => d.status === 'queued');
  const running = sorted.filter(d => d.status === 'building');

  /* ── reset paging when filters change ── */
  useEffect(() => { setShown(20); }, [filters, scopeId]);

  /* ── toast autodismiss ── */
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  /* ── close dropdown on outside click ── */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setNewBuildOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => setToast({ type, msg }), []);

  const handleBuildNow = (p: Project) => {
    setNewBuildOpen(false);
    triggerWebhookSimulation(p.id);
    showToast('success', `Build dispatched for ${p.name} — queued in the pipeline.`);
  };

  const handleRestart = (d: Deployment) => {
    triggerWebhookSimulation(d.projectId);
    showToast('success', `Restart dispatched for ${d.projectName} — new build queued.`);
  };

  const handleRefresh = async () => {
    setBusy(b => ({ ...b, refresh: true }));
    try {
      await refreshData();
      showToast('success', 'Pipeline data refreshed.');
    } catch {
      showToast('error', 'Failed to refresh pipeline data.');
    } finally {
      setBusy(b => ({ ...b, refresh: false }));
    }
  };

  /* ── environment matrix ── */
  const matrixEnvs = useMemo(() => {
    const present: string[] = Array.from(new Set(projects.map(p => p.environment)));
    return ENV_ORDER.filter(e => present.includes(e)).concat(present.filter(e => !ENV_ORDER.includes(e)));
  }, [projects]);

  const metrics: Array<{ label: string; value: string; icon: LucideIcon; color: string; pulse?: boolean }> = [
    { label: 'Total Builds', value: String(total), icon: Activity, color: 'text-white' },
    { label: 'Passing', value: String(successCount), icon: CheckCircle2, color: 'text-emerald-400' },
    { label: 'Failed', value: String(failedCount), icon: XCircle, color: 'text-red-400' },
    { label: 'Running', value: String(runningCount), icon: Loader2, color: 'text-blue-400', pulse: true },
    { label: 'Success Rate', value: `${successRate}%`, icon: ShieldCheck, color: successRate >= 90 ? 'text-emerald-400' : successRate >= 70 ? 'text-amber-400' : 'text-red-400' },
    { label: 'Avg Duration', value: fmtDur(avgDur), icon: Clock3, color: 'text-zinc-300' },
  ];

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-[60] px-4 py-2.5 rounded-lg border text-xs font-medium shadow-2xl flex items-center gap-2 ${
          toast.type === 'success'
            ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
            : 'bg-red-500/10 border-red-500/25 text-red-300'
        }`}>
          {toast.type === 'success' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
            <Layers size={15} className="text-blue-400" /> Pipeline Center
            <span className="text-[9px] font-mono text-zinc-500 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">CI/CD</span>
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            Multi-platform build orchestration, executors, and recovery operations across services.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={busy.refresh}
            className="px-3.5 py-2 rounded-lg border border-white/[0.08] hover:bg-white/[0.04] text-zinc-200 text-xs font-medium transition-all flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={busy.refresh ? 'animate-spin' : ''} />
            Refresh
          </button>

          {/* New build dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => { if (projects.length === 0) showToast('error', 'Register a service first to dispatch builds.'); else setNewBuildOpen(o => !o); }}
              className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5"
            >
              <Plus size={13} /> New Build <ChevronDown size={12} />
            </button>
            {newBuildOpen && (
              <div className="absolute right-0 mt-2 w-64 bg-[#0a0a0a] border border-white/10 rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
                <div className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                  Build now — select service
                </div>
                {projects.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleBuildNow(p)}
                    className="w-full text-left px-3 py-2 hover:bg-white/5 flex items-center justify-between group transition-all"
                  >
                    <span className="flex items-center gap-2 text-xs text-zinc-200">
                      <Server size={12} className="text-zinc-500 group-hover:text-blue-400" /> {p.name}
                    </span>
                    <span className="text-[9px] font-mono text-zinc-600 uppercase">{p.environment}</span>
                  </button>
                ))}
                {projects.length === 0 && (
                  <div className="px-3 py-3 text-center text-[11px] text-zinc-500">No services registered</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {metrics.map((m, i) => {
          const Icon = m.icon;
          return (
            <div
              key={m.label}
              className="group bg-white/[0.03] border border-white/[0.06] rounded-xl p-4"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{m.label}</span>
                <Icon size={14} className={`${m.color}${m.pulse ? ' animate-pulse' : ''}`} />
              </div>
              <div className="text-xl font-bold font-mono text-white">{m.value}</div>
            </div>
          );
        })}
      </div>

      {/* Trend + Queue */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Trend chart */}
        <div className="xl:col-span-2 bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.06] flex items-center justify-center text-zinc-400">
                <TrendingUp size={13} />
              </div>
              <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">14-Day Build Trend</h4>
              <span className="text-[10px] font-mono text-zinc-500">all pipelines</span>
            </div>
            <div className="flex gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-400"></span>Passed</span>
              <span className="flex items-center gap-1 text-red-400"><span className="w-2 h-2 rounded-full bg-red-400"></span>Failed</span>
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="label" stroke="#52525b" fontSize={10} tickLine={false} interval={1} />
                <YAxis stroke="#52525b" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#27272a', borderRadius: '8px' }}
                  labelStyle={{ color: '#f4f4f5', fontSize: '11px' }}
                  itemStyle={{ color: '#a1a1aa', fontSize: '11px' }}
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                />
                <Bar dataKey="success" name="Passed" stackId="a" fill="#34d399" barSize={12} />
                <Bar dataKey="failed" name="Failed" stackId="a" fill="#f87171" barSize={12} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Queue & Executors */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <SectionTitle icon={Clock3} title="Queue & Executors" sub={`${running.length} active`} />

          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">Build Queue</div>
          <div className="space-y-1.5 mb-4">
            {queue.length === 0 ? (
              <div className="text-[11px] text-zinc-600 text-center py-2.5 border border-dashed border-white/[0.06] rounded-lg">
                Queue is empty
              </div>
            ) : (
              queue.map(d => (
                <div key={d.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.02]">
                  <Clock3 size={12} className="text-amber-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-zinc-200 font-medium truncate">{d.projectName}</div>
                    <div className="text-[9px] text-zinc-500 font-mono">{d.version} · {timeAgo(d.createdAt)}</div>
                  </div>
                  <span className="text-[9px] font-mono text-zinc-500 shrink-0">waiting</span>
                </div>
              ))
            )}
          </div>

          <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Executors <span className="text-zinc-600">({running.length} active)</span>
          </div>
          <div className="space-y-1.5">
            {running.length === 0 ? (
              <div className="text-[11px] text-zinc-600 text-center py-2.5 border border-dashed border-white/[0.06] rounded-lg">
                All executors idle
              </div>
            ) : (
              running.map(d => (
                <div key={d.id} className="rounded-lg border border-blue-500/15 bg-blue-500/[0.03] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Loader2 size={12} className="text-blue-400 animate-spin shrink-0" />
                      <span className="text-[11px] text-zinc-200 font-medium truncate">{d.projectName}</span>
                    </div>
                    <span className="text-[9px] font-mono text-blue-400 shrink-0"><Elapsed createdAt={d.createdAt} /> elapsed</span>
                  </div>
                  <div className="relative h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                    <div className="absolute inset-0 bg-blue-400/30 animate-pulse rounded-full" />
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(d.stages || []).map((s, i) => (
                      <span key={i} className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded border ${STAGE_TEXT_CLASS[s.status]} border-white/[0.06]`}>
                        {s.status === 'running' ? '…' : s.status}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Pipelines rail + Build history */}
      <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-4">
        {/* Pipelines (jobs) */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 h-fit">
          <SectionTitle
            icon={Layers}
            title="Pipelines"
            sub={pipelines.length ? `${pipelines.length} jobs` : undefined}
          />
          <div className="space-y-1">
            <button
              onClick={() => setScopeId(null)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                scopeId === null ? 'bg-white/10 text-white' : 'text-zinc-400 hover:bg-white/[0.04]'
              }`}
            >
              <span className="flex items-center gap-2 text-xs font-medium">
                <Activity size={13} /> All Pipelines
              </span>
              <span className="text-[10px] font-mono text-zinc-500">{sorted.length}</span>
            </button>
            {pipelines.map(p => (
              <button
                key={p.project.id}
                onClick={() => setScopeId(scopeId === p.project.id ? null : p.project.id)}
                className={`w-full text-left px-3 py-2 rounded-lg transition-all ${
                  scopeId === p.project.id ? 'bg-white/10' : 'hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`flex items-center gap-2 text-xs font-medium min-w-0 ${scopeId === p.project.id ? 'text-white' : 'text-zinc-300'}`}>
                    <span className={`w-2 h-2 rounded-full shrink-0 ${p.latest ? STATUS_META[p.latest.status].dot : 'bg-zinc-700'} ${p.latest?.status === 'building' ? 'animate-pulse' : ''}`} />
                    <span className="truncate">{p.project.name}</span>
                  </span>
                  <span className="text-[9px] font-mono text-zinc-500 shrink-0">{p.count} builds</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between pl-4">
                  <WeatherDots builds={p.builds} />
                  <span className={`text-[9px] font-bold font-mono ${
                    p.rate >= 90 ? 'text-emerald-400' : p.rate >= 70 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    {p.rate}%
                  </span>
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={() => navigateTo('rollback-recovery')}
            className="mt-4 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-purple-500/20 bg-purple-500/5 hover:bg-purple-500/10 text-[11px] text-purple-300 font-medium transition-all"
          >
            <RotateCcw size={12} /> Recovery & Rollback Center
          </button>
        </div>

        {/* Build history */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <SectionTitle
            icon={Terminal}
            title={scopeId ? pipelines.find(p => p.project.id === scopeId)?.project.name || 'Build History' : 'Build History'}
            sub={`${visible.length} shown`}
          />

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center mb-4">
            <div className="relative flex-1 min-w-[160px]">
              <Search className="absolute left-3 top-2.5 text-zinc-600" size={14} />
              <input
                type="text"
                value={filters.q}
                onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
                placeholder="Search service, commit, message, author…"
                className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs py-2 pl-9 pr-3"
              />
            </div>
            <select
              value={filters.status}
              onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
              className="bg-black/30 border border-white/[0.06] text-zinc-300 focus:outline-none focus:border-white/20 rounded-md p-2 text-xs"
            >
              <option value="all">All Statuses</option>
              {(Object.keys(STATUS_META) as DeploymentStatus[]).map(s => (
                <option key={s} value={s}>{STATUS_META[s].label}</option>
              ))}
            </select>
            <select
              value={filters.platform}
              onChange={e => setFilters(f => ({ ...f, platform: e.target.value }))}
              className="bg-black/30 border border-white/[0.06] text-zinc-300 focus:outline-none focus:border-white/20 rounded-md p-2 text-xs"
            >
              <option value="all">All Platforms</option>
              <option value="vercel">Vercel</option>
              <option value="netlify">Netlify</option>
            </select>
          </div>

          {/* List */}
          <div className="space-y-2.5">
            {visible.slice(0, shown).map(d => (
              <BuildRow
                key={d.id}
                deployment={d}
                activeRollbacks={activeRollbackProjects}
                expanded={expandedId === d.id}
                onToggle={() => setExpandedId(expandedId === d.id ? null : d.id)}
                onRollback={() => setRollbackDep(d)}
                onRestart={() => handleRestart(d)}
              />
            ))}

            {visible.length === 0 && (
              <div className="py-14 text-center border border-dashed border-white/[0.08] rounded-xl">
                <Terminal size={28} className="text-zinc-700 mx-auto mb-3" />
                <p className="text-xs text-zinc-400 font-semibold">No builds match the current filters</p>
                <p className="text-[10px] text-zinc-600 mt-1">Adjust the scope or dispatch a new build.</p>
              </div>
            )}

            {shown < visible.length && (
              <button
                onClick={() => setShown(s => s + 20)}
                className="w-full py-2.5 rounded-xl border border-white/[0.08] hover:bg-white/[0.04] text-[11px] text-zinc-400 font-medium transition-all"
              >
                Show more builds ({visible.length - shown} remaining)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Environment matrix */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <SectionTitle
          icon={GitBranch}
          title="Environment Matrix"
          sub="latest build per service"
          right={pipelines.length ? (
            <span className="text-[10px] font-mono text-zinc-500">{pipelines.length} services</span>
          ) : undefined}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs min-w-[640px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                <th className="py-2.5 pr-3">Service</th>
                <th className="py-2.5 pr-3">Branch</th>
                <th className="py-2.5 pr-3">Platform</th>
                {matrixEnvs.map(e => <th key={e} className="py-2.5 pr-3">{e}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {pipelines.map(p => {
                const latest = p.latest;
                return (
                  <tr key={p.project.id} className="hover:bg-white/[0.02] transition-all">
                    <td className="py-2.5 pr-3">
                      <button
                        onClick={() => setScopeId(scopeId === p.project.id ? null : p.project.id)}
                        className="text-zinc-200 font-medium hover:text-white text-left"
                      >
                        {p.project.name}
                      </button>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-zinc-500">{p.project.branch}</td>
                    <td className="py-2.5 pr-3">
                      <span className="text-[9px] font-bold uppercase font-mono px-1.5 py-0.5 rounded border border-white/[0.06] bg-white/[0.03] text-zinc-400">
                        {p.project.provider}
                      </span>
                    </td>
                    {matrixEnvs.map(e => (
                      <td key={e} className="py-2.5 pr-3">
                        {p.project.environment === e ? (
                          latest ? (
                            <StatusChip status={latest.status} />
                          ) : (
                            <span className="text-[10px] font-mono text-zinc-700">no builds</span>
                          )
                        ) : (
                          <span className="text-[10px] font-mono text-zinc-800">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pipelines.length === 0 && (
            <div className="py-8 text-center text-xs text-zinc-600">No services registered yet.</div>
          )}
        </div>
      </div>

      {/* Rollback modal */}
      {rollbackDep && <RollbackModal deployment={rollbackDep} onClose={() => setRollbackDep(null)} />}
    </div>
  );
};

export default PipelineCenter;