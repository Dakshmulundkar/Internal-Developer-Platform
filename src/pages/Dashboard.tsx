import React, { useMemo, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import type { PageType } from '../context/PlatformContext';
import {
  FolderGit2, AlertTriangle, Activity, Rocket,
  ArrowUpRight, ShieldAlert, Cpu, Puzzle, Bell,
  CheckCircle2, X,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface AttentionItem {
  key: string;
  kind: 'deploy' | 'incident' | 'alert';
  rank: number;
  title: string;
  meta: string;
  createdAt: string;
  page: PageType;
  contextIds?: { deploymentId?: string; incidentId?: string };
}

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

export const Dashboard: React.FC = () => {
  const {
    projects, deployments, incidents,
    auditLogs, navigateTo, pluginInstallations, monitoringAlerts, sentryIssues,
  } = usePlatform();

  const [allClearDismissed, setAllClearDismissed] = useState(false);
  const [attentionClosed, setAttentionClosed] = useState(false);
  // Per-item read state — persisted so opening an item removes it even across
  // page navigation. New arrivals (unknown keys) always show.
  const [readKeys, setReadKeys] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('idp_attention_read') || '[]');
      return Array.isArray(saved) ? saved.filter(k => typeof k === 'string').slice(-50) : [];
    } catch {
      return [];
    }
  });

  const {
    success7d, failed7d, total7d, openIncidents, openBySev,
    firingAlerts, firingBySource, queue, deployChartData, recentDeploys,
    grafanaFiring, grafanaValue, unresolvedSentry, newSentryToday, datadogFiring,
    connectedPlugins,
  } = useMemo(() => {
    const weekAgo = Date.now() - 7 * 86400000;
    const in7d = deployments.filter(d => +new Date(d.createdAt) >= weekAgo);
    const ok7d = in7d.filter(d => d.status === 'ready' || d.status === 'rolled_back').length;
    const failed7d = in7d.filter(d => d.status === 'failed');

    const open = incidents.filter(i => i.status !== 'resolved');
    const bySev = (s: string) => open.filter(i => i.severity === s).length;

    const firing = monitoringAlerts.filter(a => a.status === 'firing');
    const firingSrc = (s: string) => firing.filter(a => a.source === s);
    const grafanaFiring = firingSrc('grafana');
    const grafanaValue: string | null = grafanaFiring[0]?.value ?? null;

    const unresolved = (sentryIssues ?? []).filter(i => i.status === 'unresolved');
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const newToday = (sentryIssues ?? []).filter(i => (i.firstSeen || '') >= dayAgo).length;

    /* Severity-ordered attention queue — failed deploys first, then incidents, then alerts */
    const items: AttentionItem[] = [
      ...failed7d.map(d => ({
        key: `deploy-${d.id}`, kind: 'deploy' as const, rank: 0,
        title: `${d.projectName} ${d.version} failed`,
        meta: `${d.branch} · ${d.errorMessage || 'build failed'}`,
        createdAt: d.createdAt, page: 'deployment-details' as PageType,
        contextIds: { deploymentId: d.id },
      })),
      ...open.map(i => ({
        key: `incident-${i.id}`, kind: 'incident' as const,
        rank: 1 + (SEV_RANK[i.severity] ?? 4),
        title: i.title,
        meta: `${i.severity} · ${i.projectName}`,
        createdAt: i.createdAt, page: 'incidents' as PageType,
        contextIds: { incidentId: i.id },
      })),
      ...firing.map(a => ({
        key: `alert-${a.id}`, kind: 'alert' as const, rank: 10,
        title: a.title,
        meta: `${a.source} · ${a.severity}`,
        createdAt: a.firedAt, page: 'monitoring' as PageType,
        contextIds: undefined,
      })),
    ];
    items.sort((a, b) => a.rank - b.rank || +new Date(b.createdAt) - +new Date(a.createdAt));

    /* Real 7d deploy bars — success vs failed per day. No filler. */
    const deployChartData = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - idx));
      const ymd = d.toISOString().slice(0, 10);
      const day = deployments.filter(x => (x.createdAt || '').startsWith(ymd));
      return {
        name: d.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        success: day.filter(x => x.status === 'ready' || x.status === 'rolled_back').length,
        failed: day.filter(x => x.status === 'failed').length,
      };
    });

    return {
      success7d: in7d.length > 0 ? Math.round((ok7d / in7d.length) * 100) : null,
      failed7d: failed7d.length,
      total7d: in7d.length,
      openBySev: { critical: bySev('critical'), high: bySev('high'), medium: bySev('medium'), low: bySev('low') },
      openIncidents: open.length,
      firingBySource: firingSrc,
      firingAlerts: firing.length,
      queue: items.slice(0, 8),
      deployChartData,
      recentDeploys: [...deployments]
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .slice(0, 5),
      grafanaFiring,
      grafanaValue,
      unresolvedSentry: unresolved.length,
      newSentryToday: newToday,
      datadogFiring: firingSrc('datadog').length,
      connectedPlugins: pluginInstallations.filter(p => p.status === 'connected').length,
    };
  }, [projects, deployments, incidents, monitoringAlerts, sentryIssues, pluginInstallations]);

  const activeDeployments = deployments.filter(d => d.status === 'building' || d.status === 'queued').length;
  const allClear = openIncidents === 0 && firingAlerts === 0 && failed7d === 0;

  // Derived after the memo above — reading `queue` any earlier is a TDZ crash.
  const visibleQueue = queue.filter(item => !readKeys.includes(item.key));
  const markItemRead = (key: string) => {
    setReadKeys(prev => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key].slice(-50);
      try {
        localStorage.setItem('idp_attention_read', JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  const kpis = [
    {
      label: 'Deploy success · 7d', value: success7d == null ? '—' : `${success7d}%`,
      sub: total7d === 0 ? 'no deploys this week' : `${total7d} deploys`,
      icon: Rocket, color: 'text-emerald-400', bg: 'rgba(52,211,153,0.15)',
      page: 'deployments' as PageType,
    },
    {
      label: 'Failed deploys · 7d', value: failed7d,
      sub: failed7d > 0 ? 'needs attention' : 'clean week',
      icon: AlertTriangle, color: failed7d > 0 ? 'text-red-400' : 'text-zinc-500', bg: 'rgba(248,113,113,0.15)',
      valueColor: failed7d > 0 ? 'text-red-400' : 'text-white',
      page: 'deployments' as PageType,
    },
    {
      label: 'Open incidents', value: openIncidents,
      sub: openIncidents > 0
        ? `P1 ${openBySev.critical} · P2 ${openBySev.high} · P3 ${openBySev.medium}`
        : 'nothing open',
      icon: ShieldAlert, color: openIncidents > 0 ? 'text-red-400' : 'text-zinc-500', bg: 'rgba(248,113,113,0.15)',
      valueColor: openIncidents > 0 ? 'text-red-400' : 'text-white',
      page: 'incidents' as PageType,
    },
    {
      label: 'Firing alerts', value: firingAlerts,
      sub: firingAlerts > 0
        ? `grafana ${firingBySource('grafana').length} · sentry ${unresolvedSentry} · datadog ${datadogFiring}`
        : 'all monitors quiet',
      icon: Bell, color: firingAlerts > 0 ? 'text-amber-400' : 'text-zinc-500', bg: 'rgba(251,191,36,0.15)',
      valueColor: firingAlerts > 0 ? 'text-amber-400' : 'text-white',
      page: 'monitoring' as PageType,
    },
  ];

  const age = (ts: string) => {
    const s = Math.floor((Date.now() - +new Date(ts)) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  return (
    <div className="space-y-6">
      {/* Status banner — onboarding aid, only until the first project exists */}
      {projects.length === 0 && (
      <div className="chart-card p-5">
        <div className="card-glow" style={{ background: '#3B82F6' }}></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
              <Cpu size={15} className="text-zinc-400" />
              Infrastructure Status
              <span className={`text-[10px] font-mono font-semibold border px-2 py-0.5 rounded-full ${
                allClear
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
              }`}>
                {allClear ? 'Operational' : `${queue.length} need attention`}
              </span>
            </h3>
            <p className="text-[10px] text-zinc-500 mt-1">
              {activeDeployments} pipelines running · {connectedPlugins}/{pluginInstallations.length} integrations connected · {projects.length} services
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigateTo('integrations')}
              className="bg-dark-800 text-zinc-300 border border-white/[0.06] hover:bg-dark-700 font-medium py-2 px-3 rounded-lg text-xs transition-all flex items-center gap-1.5">
              <Puzzle size={13} /> Integrations
            </button>
            <button onClick={() => navigateTo('create-project')}
              className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-3 rounded-lg text-xs transition-all flex items-center gap-1.5">
              <FolderGit2 size={13} /> Onboard Project
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Four KPIs — each deep-links to its source page */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger-children">
        {kpis.map((card, idx) => {
          const Icon = card.icon;
          return (
            <div key={card.label} onClick={() => navigateTo(card.page)} style={{ animationDelay: `${idx * 60}ms` }}
              className="kpi-card p-4 cursor-pointer transition-all group animate-slide-up">
              <div className="card-glow" style={{ background: '#3B82F6' }}></div>
              <div className="flex justify-between items-start mb-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 leading-snug max-w-[70%]">{card.label}</span>
                <span className="rounded-xl p-2 shrink-0" style={{ background: card.bg }}>
                  <Icon size={14} className={card.color} />
                </span>
              </div>
              <div className={`text-[32px] font-bold tracking-[-0.03em] font-mono leading-none ${'valueColor' in card && card.valueColor ? card.valueColor : 'text-white'}`}>{card.value}</div>
              <div className="text-[10px] text-zinc-500 mt-1.5 flex items-center gap-1 group-hover:text-zinc-400 transition-colors">
                <span>{card.sub}</span>
                <ArrowUpRight size={9} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Needs attention — one severity-ordered queue replaces 4 duplicative cards.
          Opening an item marks it read (removes it); the box hides once every
          item is read and returns only for new arrivals. */}
      {!attentionClosed && (visibleQueue.length > 0 || (!allClearDismissed && queue.length === 0)) && (
      <div className="chart-card p-5">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Needs attention</h4>
          <div className="flex items-center gap-2">
            {visibleQueue.length > 0 && <span className="text-[10px] font-mono text-zinc-500">{visibleQueue.length} open</span>}
            <button onClick={() => setAttentionClosed(true)} title="Close"
              className="p-1 rounded text-zinc-600 hover:text-zinc-300 transition-all shrink-0">
              <X size={12} />
            </button>
          </div>
        </div>
        {visibleQueue.length === 0 ? (
          <div className="flex items-center gap-3 p-3 bg-emerald-500/[0.04] border border-emerald-500/15 rounded-lg group">
            <span className="p-1.5 rounded shrink-0 text-emerald-400 bg-emerald-500/10">
              <CheckCircle2 size={13} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-zinc-200">All clear</p>
              <p className="text-[10px] text-zinc-500 truncate">No failed deploys, open incidents, or firing alerts.</p>
            </div>
            <button onClick={() => setAllClearDismissed(true)} title="Dismiss"
              className="p-1 rounded text-zinc-600 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all shrink-0">
              <X size={12} />
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleQueue.map(item => (
              <div key={item.key} onClick={() => { markItemRead(item.key); navigateTo(item.page, item.contextIds); }}
                className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] rounded-lg cursor-pointer transition-all group">
                <span className={`p-1.5 rounded shrink-0 ${
                  item.kind === 'deploy' ? 'text-red-400 bg-red-500/10' :
                  item.kind === 'incident' ? 'text-orange-400 bg-orange-500/10' :
                  'text-amber-400 bg-amber-500/10'
                }`}>
                  {item.kind === 'deploy' ? <AlertTriangle size={13} /> :
                   item.kind === 'incident' ? <ShieldAlert size={13} /> : <Activity size={13} />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-zinc-200 truncate">{item.title}</p>
                  <p className="text-[10px] text-zinc-500 truncate">{item.meta}</p>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 shrink-0">{age(item.createdAt)}</span>
                <ArrowUpRight size={12} className="text-zinc-600 group-hover:text-zinc-300 transition-colors shrink-0" />
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Delivery health — did my deploy land? */}
        <div className="chart-card p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Recent deployments</h4>
            <button onClick={() => navigateTo('deployments')} className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline">View all</button>
          </div>
          {recentDeploys.length === 0 ? (
            <p className="text-xs text-zinc-500 p-4 text-center bg-white/[0.01] border border-white/[0.04] rounded-lg">No deployments yet.</p>
          ) : (
            <>
              <div className="h-36 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={deployChartData} margin={{ top: 5, right: 5, left: -28, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                    <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} />
                    <YAxis stroke="#52525b" fontSize={10} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#27272a', borderRadius: '8px' }} labelStyle={{ color: '#f4f4f5', fontSize: '11px' }} itemStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="success" fill="#34d399" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="failed" fill="#f87171" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {recentDeploys.map(d => (
                  <div key={d.id} onClick={() => navigateTo('deployment-details', { deploymentId: d.id })}
                    className="flex items-center gap-3 p-2.5 rounded-lg border border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-all">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      d.status === 'ready' ? 'bg-emerald-400' :
                      d.status === 'failed' ? 'bg-red-400' : 'bg-blue-400 animate-pulse'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-zinc-200 truncate">{d.projectName} <span className="text-zinc-500 font-mono">{d.version}</span></p>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-500 shrink-0">{age(d.createdAt)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="space-y-6">
          {/* Service snapshot — per-source signal rows */}
          <div className="chart-card p-5">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Service snapshot</h4>
              <button onClick={() => navigateTo('monitoring')} className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline">Monitoring</button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <span className="text-[9px] font-black font-mono px-1.5 py-0.5 rounded border bg-orange-500/10 text-orange-400 border-orange-500/25 shrink-0">GF</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-200">Grafana</p>
                  <p className="text-[10px] text-zinc-500 truncate">{grafanaFiring.length === 0 ? 'no firing alerts' : grafanaValue || `${grafanaFiring.length} firing`}</p>
                </div>
                <span className={`text-xs font-mono font-bold ${grafanaFiring.length > 0 ? 'text-orange-400' : 'text-zinc-500'}`}>{grafanaFiring.length}</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <span className="text-[9px] font-black font-mono px-1.5 py-0.5 rounded border bg-violet-500/10 text-violet-400 border-violet-500/25 shrink-0">SN</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-200">Sentry</p>
                  <p className="text-[10px] text-zinc-500 truncate">{unresolvedSentry === 0 ? 'no unresolved issues' : `${newSentryToday} new today`}</p>
                </div>
                <span className={`text-xs font-mono font-bold ${unresolvedSentry > 0 ? 'text-violet-400' : 'text-zinc-500'}`}>{unresolvedSentry}</span>
              </div>
              <div className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                <span className="text-[9px] font-black font-mono px-1.5 py-0.5 rounded border bg-purple-500/10 text-purple-400 border-purple-500/25 shrink-0">DD</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-200">Datadog</p>
                  <p className="text-[10px] text-zinc-500 truncate">{datadogFiring === 0 ? 'all monitors quiet' : `${datadogFiring} firing`}</p>
                </div>
                <span className={`text-xs font-mono font-bold ${datadogFiring > 0 ? 'text-purple-400' : 'text-zinc-500'}`}>{datadogFiring}</span>
              </div>
            </div>
          </div>

          {/* Audit trail — capped at 20 */}
          <div className="chart-card p-5">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Audit trail</h4>
              <button onClick={() => navigateTo('notifications')} className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline">View all</button>
            </div>
            {auditLogs.length === 0 ? (
              <p className="text-xs text-zinc-500 p-4 text-center bg-white/[0.01] border border-white/[0.04] rounded-lg">No activity yet.</p>
            ) : (
              <div className="space-y-0">
                {auditLogs.slice(0, 20).map((log, idx, arr) => (
                  <div key={log.id} className="relative flex gap-3 pb-3 last:pb-0">
                    {idx < arr.length - 1 && <div className="absolute left-[7px] top-4 bottom-0 w-px bg-white/[0.06]" />}
                    <span className="w-[15px] h-[15px] rounded-full border border-white/[0.1] bg-white/[0.03] shrink-0 z-10 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-zinc-300 truncate">
                        <span className="font-mono text-zinc-500">{log.action}</span> · {log.details || log.userName}
                      </p>
                      <p className="text-[9px] text-zinc-600 font-mono">{age(log.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
