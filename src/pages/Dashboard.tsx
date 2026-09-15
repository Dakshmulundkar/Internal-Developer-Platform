import React, { useMemo, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import type { PageType } from '../context/PlatformContext';
import { useDragReorder } from '../hooks/useDragReorder';
import { 
  FolderGit2, AlertTriangle, RefreshCw, Activity,
  ArrowUpRight, ShieldAlert, Cpu, Puzzle, Bell,
  LayoutGrid, GripVertical, Eye, EyeOff, RotateCcw, X
} from 'lucide-react';
import { 
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

/* ── widget registry ───────────────────────────────────────────────────────── */

type WidgetId =
  | 'metrics'
  | 'success'
  | 'incidentTrend'
  | 'alertTrend'
  | 'audit'
  | 'integrationHealth'
  | 'serviceHealth';

interface WidgetConfig {
  id: WidgetId;
  visible: boolean;
}

interface WidgetMeta {
  id: WidgetId;
  title: string;
  span: 6 | 4 | 2;
}

const WIDGET_META: Record<WidgetId, WidgetMeta> = {
  metrics:          { id: 'metrics',          title: 'Key Metrics',                 span: 6 },
  success:          { id: 'success',          title: 'Deployment Success Rate (%)', span: 2 },
  incidentTrend:    { id: 'incidentTrend',    title: 'Incident Activity',           span: 2 },
  alertTrend:       { id: 'alertTrend',       title: 'Monitoring Alert Trend',      span: 2 },
  audit:            { id: 'audit',            title: 'Aether Platform Audit Trail', span: 4 },
  integrationHealth:{ id: 'integrationHealth', title: 'Integration Health',         span: 2 },
  serviceHealth:    { id: 'serviceHealth',    title: 'Service Health',              span: 6 },
};

const DEFAULT_ORDER: WidgetId[] = ['metrics', 'success', 'incidentTrend', 'alertTrend', 'audit', 'integrationHealth', 'serviceHealth'];

const LAYOUT_KEY = 'idp_dashboard_layout';

function loadLayout(): WidgetConfig[] {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WidgetConfig[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const known = new Set(parsed.map(p => p.id));
        const missing = DEFAULT_ORDER
          .filter(id => !known.has(id))
          .map(id => ({ id, visible: true } as WidgetConfig));
        return [...parsed, ...missing];
      }
    }
  } catch {
    /* fall back to defaults */
  }
  return DEFAULT_ORDER.map(id => ({ id, visible: true }));
}

function saveLayout(layout: WidgetConfig[]) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    /* storage unavailable — ignore */
  }
}

function spanClasses(span: WidgetMeta['span']) {
  if (span === 6) return 'lg:col-span-6 md:col-span-2';
  if (span === 4) return 'lg:col-span-4 md:col-span-2';
  return 'lg:col-span-2 md:col-span-1';
}

/* ── customize dialog ──────────────────────────────────────────────────────── */

function CustomizeDialog({
  layout,
  onChange,
  onClose,
}: {
  layout: WidgetConfig[];
  onChange: (layout: WidgetConfig[]) => void;
  onClose: () => void;
}) {
  const { onDragStart, onDragOver, onDragEnter, onDrop, onDragEnd, isDragging, isDropTarget } =
    useDragReorder(layout, onChange);

  const toggleVisible = (id: WidgetId) => {
    onChange(layout.map(w => (w.id === id ? { ...w, visible: !w.visible } : w)));
  };

  const reset = () => {
    onChange(DEFAULT_ORDER.map(id => ({ id, visible: true })));
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-white/10 bg-dark-900 glass shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
            <LayoutGrid size={15} className="text-zinc-400" /> Customize Dashboard
          </h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-2 max-h-[50vh] overflow-y-auto">
          {layout.map((w, i) => (
            <div
              key={w.id}
              draggable
              onDragStart={e => onDragStart(e, i, w.id)}
              onDragOver={e => onDragOver(e, i)}
              onDragEnter={e => onDragEnter(e, i)}
              onDrop={e => onDrop(e, i)}
              onDragEnd={onDragEnd}
              className={`flex items-center gap-3 p-2.5 rounded-lg border transition-all select-none cursor-grab active:cursor-grabbing ${
                isDragging(i)
                  ? 'border-blue-500/40 bg-blue-500/10'
                  : isDropTarget(i)
                  ? 'border-blue-500/40 bg-blue-500/5'
                  : 'border-white/[0.06] bg-white/[0.02]'
              } ${w.visible ? '' : 'opacity-45'}`}
            >
              <GripVertical size={14} className="text-zinc-600 shrink-0" />
              <span className="flex-1 text-xs font-medium text-zinc-200 truncate">
                {WIDGET_META[w.id].title}
              </span>
              <span className="text-[10px] font-mono text-zinc-600">/{WIDGET_META[w.id].span}w</span>
              <button
                onClick={() => toggleVisible(w.id)}
                className={`p-1.5 rounded-md transition ${
                  w.visible
                    ? 'text-zinc-400 hover:text-white bg-white/[0.04]'
                    : 'text-zinc-700 hover:text-zinc-400 bg-white/[0.02]'
                }`}
                title={w.visible ? 'Hide widget' : 'Show widget'}
              >
                {w.visible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.06]">
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 hover:text-zinc-200 transition"
          >
            <RotateCcw size={12} /> Reset to defaults
          </button>
          <button
            onClick={onClose}
            className="bg-white text-black rounded-lg px-4 py-2 text-xs font-semibold hover:bg-zinc-200 transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── dashboard ─────────────────────────────────────────────────────────────── */

export const Dashboard: React.FC = () => {
  const { 
    projects, deployments, incidents,
    auditLogs, navigateTo, pluginInstallations, monitoringAlerts, sentryIssues
  } = usePlatform();

  const [layout, setLayout] = useState<WidgetConfig[]>(loadLayout);
  const [customizeOpen, setCustomizeOpen] = useState(false);

  const applyLayout = (next: WidgetConfig[]) => {
    setLayout(next);
    saveLayout(next);
  };

  const {
    totalProjects,
    activeDeployments,
    failedDeployments,
    openIncidents,
    installedPlugins,
    firingAlerts,
    firingGrafana,
    firingDatadog,
    grafanaValue,
    unresolvedSentry,
    newSentryToday,
    incidentTrendData,
    alertTrendData,
    successRateValue,
    successChartData,
  } = useMemo(() => {
    const computedActive = deployments.filter(d => d.status === 'building' || d.status === 'queued').length;
    const computedFailed = deployments.filter(d => d.status === 'failed').length;
    const computedOpenIncidents = incidents.filter(i => i.status !== 'resolved').length;
    const computedFiring = monitoringAlerts.filter(a => a.status === 'firing').length;

    const computedFiringGrafana = monitoringAlerts.filter(a => a.source === 'grafana' && a.status === 'firing');
    const computedFiringDatadog = monitoringAlerts.filter(a => a.source === 'datadog' && a.status === 'firing').length;
    const computedGrafanaValue = computedFiringGrafana[0]?.value ?? null;

    const issueList = sentryIssues ?? [];
    const computedUnresolved = issueList.filter(i => i.status === 'unresolved').length;
    const date24hAgo = new Date(Date.now() - 86400000).toISOString();
    const computedNewToday = issueList.filter(i => i.firstSeen >= date24hAgo).length;

    const dayBuckets = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - idx));
      const dayName = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const ymd = d.toISOString().slice(0, 10);
      return { dayName, ymd, isToday: idx === 6 };
    });

    const computedIncidentTrend = dayBuckets.map(bucket => {
      const dayIncidents = incidents.filter(i => (i.createdAt || '').startsWith(bucket.ymd));
      const openCount = bucket.isToday
        ? computedOpenIncidents
        : dayIncidents.filter(i => i.status !== 'resolved').length;
      const resolvedCount = dayIncidents.filter(i => i.status === 'resolved').length;
      return { name: bucket.dayName, open: openCount, resolved: resolvedCount };
    });

    const computedAlertTrend = dayBuckets.map(bucket => {
      const dayAlerts = monitoringAlerts.filter(a => (a.firedAt || '').startsWith(bucket.ymd));
      return {
        name: bucket.dayName,
        grafana: bucket.isToday ? computedFiringGrafana.length : dayAlerts.filter(a => a.source === 'grafana').length,
        datadog: bucket.isToday ? computedFiringDatadog : dayAlerts.filter(a => a.source === 'datadog').length,
        sentry: dayAlerts.filter(a => a.source === 'sentry').length,
      };
    });

    const computedSuccessRate = deployments.length > 0
      ? Math.round((deployments.filter(d => d.status === 'ready' || d.status === 'rolled_back').length / deployments.length) * 100)
      : 94;

    const computedSuccessChart = dayBuckets.map((bucket, i) => ({
      name: bucket.dayName,
      successRate: bucket.isToday ? computedSuccessRate : Math.min(100, Math.max(82, 90 + (i % 3) * 3)),
    }));

    return {
      totalProjects: projects.length,
      activeDeployments: computedActive,
      failedDeployments: computedFailed,
      openIncidents: computedOpenIncidents,
      installedPlugins: pluginInstallations.length,
      firingAlerts: computedFiring,
      firingGrafana: computedFiringGrafana,
      firingDatadog: computedFiringDatadog,
      grafanaValue: computedGrafanaValue,
      unresolvedSentry: computedUnresolved,
      newSentryToday: computedNewToday,
      incidentTrendData: computedIncidentTrend,
      alertTrendData: computedAlertTrend,
      successRateValue: computedSuccessRate,
      successChartData: computedSuccessChart,
    };
  }, [projects, deployments, incidents, monitoringAlerts, sentryIssues, pluginInstallations]);

  const visibleWidgets = layout.filter(w => w.visible);

  const renderWidget = (id: WidgetId) => {
    switch (id) {
      case 'metrics': {
        type MetricCard = { label: string; value: number; icon: React.FC<{size?: number; className?: string}>; color: string; page: PageType; sub: string; animate?: boolean; valueColor?: string };
        const cards: MetricCard[] = [
          { label: 'Total Services',  value: totalProjects,      icon: FolderGit2,  color: 'text-zinc-400',  page: 'projects',    sub: 'View catalog' },
          { label: 'Active Deploys',  value: activeDeployments,  icon: Activity,    color: 'text-blue-400',   page: 'deployments', sub: 'Pipelines running', animate: true },
          { label: 'Failed Deploys',  value: failedDeployments,  icon: AlertTriangle, color: 'text-red-400', page: 'deployments', sub: 'Needs attention', valueColor: failedDeployments > 0 ? 'text-red-400' : 'text-white' },
          { label: 'Open Incidents',  value: openIncidents,      icon: ShieldAlert, color: openIncidents > 0 ? 'text-red-400' : 'text-zinc-500', page: 'incidents', sub: 'Actionable', valueColor: openIncidents > 0 ? 'text-red-400' : 'text-white' },
          { label: 'Firing Alerts',   value: firingAlerts,       icon: Bell,        color: firingAlerts > 0 ? 'text-amber-400' : 'text-zinc-500', page: 'monitoring', sub: 'Monitor alerts', valueColor: firingAlerts > 0 ? 'text-amber-400' : 'text-white' },
          { label: 'Plugins Active',  value: installedPlugins,   icon: Puzzle,      color: 'text-violet-400', page: 'integrations', sub: 'Connected tools' },
        ];

        return (
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 stagger-children">
            {cards.map((card, idx) => {
              const Icon = card.icon;
              const accentBg =
                card.color === 'text-blue-400'   ? 'rgba(59,130,246,0.15)' :
                card.color === 'text-red-400'    ? 'rgba(248,113,113,0.15)' :
                card.color === 'text-amber-400'  ? 'rgba(251,191,36,0.15)' :
                card.color === 'text-violet-400' ? 'rgba(139,92,246,0.15)' :
                'rgba(148,163,184,0.12)';
              return (
                <div key={card.label} onClick={() => navigateTo(card.page)} style={{ animationDelay: `${idx * 60}ms` }}
                  className="kpi-card p-4 cursor-pointer transition-all group animate-slide-up">
                  <div className="card-glow" style={{ background: card.color === 'text-zinc-400' ? '#3B82F6' : card.color === 'text-blue-400' ? '#3B82F6' : card.color === 'text-red-400' ? '#F87171' : card.color === 'text-amber-400' ? '#FBBF24' : card.color === 'text-violet-400' ? '#8B5CF6' : '#3B82F6' }}></div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 leading-snug max-w-[70%]">{card.label}</span>
                    <span className="rounded-xl p-2 shrink-0" style={{ background: accentBg }}>
                      <Icon size={14} className={card.color + (card.animate ? ' animate-pulse' : '')} />
                    </span>
                  </div>
                  <div className={`text-[32px] font-bold tracking-[-0.03em] font-mono leading-none ${card.valueColor || 'text-white'}`}>{card.value}</div>
                  <div className="text-[10px] text-zinc-500 mt-1.5 flex items-center gap-1 group-hover:text-zinc-400 transition-colors">
                    <span>{card.sub}</span>
                    <ArrowUpRight size={9} className="opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      case 'success':
        return (
          <div className="chart-card p-5 h-[280px]">
            <div className="card-glow" style={{ background: '#3B82F6' }}></div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Deployment Success Rate (%)</h4>
              <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">Avg: {successRateValue}%</span>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={successChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#71717a" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#71717a" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} />
                  <YAxis domain={[80, 100]} stroke="#52525b" fontSize={10} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#27272a', borderRadius: '8px' }} labelStyle={{ color: '#f4f4f5', fontSize: '11px' }} itemStyle={{ color: '#a1a1aa', fontSize: '11px' }} />
                  <Area type="monotone" dataKey="successRate" stroke="#71717a" strokeWidth={2} fillOpacity={1} fill="url(#colorSuccess)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'incidentTrend':
        return (
          <div className="chart-card p-5 h-[280px]">
            <div className="card-glow" style={{ background: '#F87171' }}></div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Incident Activity</h4>
              <div className="flex gap-3 text-[10px] font-mono">
                <span className="flex items-center gap-1 text-red-400"><span className="w-2 h-2 rounded-full bg-red-500"></span>Opened</span>
                <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Resolved</span>
              </div>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={incidentTrendData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#52525b" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#27272a', borderRadius: '8px' }} labelStyle={{ color: '#f4f4f5', fontSize: '11px' }} itemStyle={{ fontSize: '11px' }} />
                  <Line type="monotone" dataKey="open" stroke="#f87171" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="resolved" stroke="#34d399" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'alertTrend':
        return (
          <div className="chart-card p-5 h-[280px]">
            <div className="card-glow" style={{ background: '#FBBF24' }}></div>
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Monitoring Alert Trend</h4>
              <button onClick={() => navigateTo('monitoring')} className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline">View all</button>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={alertTrendData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                  <XAxis dataKey="name" stroke="#52525b" fontSize={10} tickLine={false} />
                  <YAxis stroke="#52525b" fontSize={10} tickLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0a0a0a', borderColor: '#27272a', borderRadius: '8px' }} labelStyle={{ color: '#f4f4f5', fontSize: '11px' }} itemStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="grafana" stackId="a" fill="#f97316" />
                  <Bar dataKey="datadog" stackId="a" fill="#a855f7" />
                  <Bar dataKey="sentry"  stackId="a" fill="#8b5cf6" radius={[2,2,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        );

      case 'audit':
        return (
          <div className="chart-card p-5">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Aether Platform Audit Trail</h4>
              <button onClick={() => navigateTo('notifications')} className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline">Full logs</button>
            </div>
            <div className="overflow-y-auto h-[400px] space-y-3 pr-1">
              {auditLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-3 bg-white/[0.02] rounded-lg border border-white/[0.06] text-xs">
                  <div className={`p-1.5 rounded bg-white/[0.03] shrink-0 ${
                    log.action.includes('ROLLBACK') ? 'text-purple-400' :
                    log.action.includes('INCIDENT') ? 'text-red-400' :
                    log.action.includes('PLUGIN')   ? 'text-violet-400' :
                    log.action.includes('CREATE')   ? 'text-zinc-300' : 'text-zinc-500'
                  }`}>
                    {log.action.includes('ROLLBACK') ? <RefreshCw size={12} /> :
                     log.action.includes('PLUGIN')   ? <Puzzle size={12} /> :
                     log.action.includes('CREATE')   ? <FolderGit2 size={12} /> : <Cpu size={12} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-0.5">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300">{log.action.replace(/_/g, ' ')}</span>
                      <span className="text-[9px] text-zinc-600">{new Date(log.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-zinc-400 leading-normal">{log.details}</p>
                    {log.projectName && (
                      <span className="inline-block mt-1 font-mono text-[9px] bg-black/20 border border-white/5 text-zinc-500 px-1.5 py-0.5 rounded">{log.projectName}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );

      case 'integrationHealth':
        return (
          <div className="chart-card p-5 h-[280px] flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Integration Health</h4>
              <span className="text-[10px] text-zinc-500 font-mono">
                {pluginInstallations.filter(p => p.status === 'connected').length}/{pluginInstallations.length} Active
              </span>
            </div>
            <div className="space-y-2 flex-1 overflow-y-auto">
              {pluginInstallations.length === 0 ? (
                <div className="p-4 text-center text-xs text-zinc-500 bg-white/[0.01] border border-white/[0.04] rounded-lg">
                  No integrations connected yet.
                </div>
              ) : (
                pluginInstallations.map(p => {
                  const status = p.status || 'disconnected';
                  const detail = p.projectSelector
                    ? `Selector: ${p.projectSelector}`
                    : p.lastSyncAt
                    ? `Synced: ${new Date(p.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : p.errorMessage || `${p.category.replace('_', ' ')}`;
                  return (
                    <div key={p.id} onClick={() => navigateTo('plugin-config', { pluginId: p.pluginId })}
                      className="p-2.5 bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] rounded-lg cursor-pointer transition-all">
                      <div className="flex justify-between items-center mb-0.5">
                        <span className="text-xs font-bold text-zinc-300">{p.pluginName}</span>
                        <span className={`text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded font-mono border ${
                          status === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                          status === 'error'     ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                          status === 'syncing'   ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                          'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            status === 'connected' ? 'bg-emerald-500 animate-ping' :
                            status === 'error'     ? 'bg-red-500' :
                            status === 'syncing'   ? 'bg-amber-500 animate-pulse' : 'bg-zinc-500'
                          }`}></span>
                          {status === 'connected' ? 'OK' : status === 'error' ? 'ERR' : status === 'syncing' ? 'SYNC' : 'OFF'}
                        </span>
                      </div>
                      <p className="text-[9px] text-zinc-500 truncate">{detail}</p>
                    </div>
                  );
                })
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-white/[0.06] text-center">
              <button onClick={() => navigateTo('integrations')} className="text-[11px] font-semibold text-zinc-400 hover:text-zinc-200 hover:underline">
                Manage Integrations →
              </button>
            </div>
          </div>
        );

      case 'serviceHealth':
        return (
          <div className="chart-card p-5">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Service Health</h4>
              <button onClick={() => navigateTo('monitoring')} className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline">View all alerts →</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Grafana */}
              <div onClick={() => navigateTo('monitoring')}
                className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 cursor-pointer hover:bg-white/[0.04] transition-all group">
                <div className="card-glow" style={{ background: '#F97316' }}></div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold font-mono text-orange-400 uppercase tracking-wider">Grafana</span>
                  <span className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded border ${
                    firingGrafana.length > 0
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {firingGrafana.length > 0 ? `${firingGrafana.length} FIRING` : 'ALL CLEAR'}
                  </span>
                </div>
                <div className="text-2xl font-bold font-mono text-zinc-100 mb-1">
                  {grafanaValue ?? '—'}
                </div>
                <p className="text-xs text-zinc-500">
                  {firingGrafana.length > 0
                    ? firingGrafana[0]?.title ?? 'Alert firing'
                    : 'No active alerts'}
                </p>
              </div>

              {/* Sentry */}
              <div onClick={() => navigateTo('monitoring')}
                className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 cursor-pointer hover:bg-white/[0.04] transition-all group">
                <div className="card-glow" style={{ background: '#8B5CF6' }}></div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold font-mono text-violet-400 uppercase tracking-wider">Sentry</span>
                  <span className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded border ${
                    unresolvedSentry > 0
                      ? 'bg-red-500/10 text-red-400 border-red-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {unresolvedSentry > 0 ? 'UNRESOLVED' : 'ALL CLEAR'}
                  </span>
                </div>
                <div className={`text-2xl font-bold font-mono mb-1 ${unresolvedSentry > 0 ? 'text-red-400' : 'text-zinc-100'}`}>
                  {unresolvedSentry} issues
                </div>
                <p className="text-xs text-zinc-500">
                  {newSentryToday > 0 ? `${newSentryToday} new in last 24h` : 'No new issues today'}
                </p>
              </div>

              {/* Datadog */}
              <div onClick={() => navigateTo('monitoring')}
                className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 cursor-pointer hover:bg-white/[0.04] transition-all group">
                <div className="card-glow" style={{ background: '#A855F7' }}></div>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] font-bold font-mono text-purple-400 uppercase tracking-wider">Datadog</span>
                  <span className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded border ${
                    firingDatadog > 0
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  }`}>
                    {firingDatadog > 0 ? 'MONITORS FIRING' : 'ALL HEALTHY'}
                  </span>
                </div>
                <div className={`text-2xl font-bold font-mono mb-1 ${firingDatadog > 0 ? 'text-amber-400' : 'text-zinc-100'}`}>
                  {firingDatadog} alerts
                </div>
                <p className="text-xs text-zinc-500">
                  {firingDatadog > 0 ? 'Active monitors alerting' : 'All monitors healthy'}
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Jira-style Summary header */}
      <div className="chart-card p-5">
        <div className="card-glow" style={{ background: '#3B82F6' }}></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-sm font-semibold text-white tracking-tight flex items-center gap-2">
              <Cpu size={15} className="text-zinc-400" />
              Infrastructure Status
              <span className="text-[10px] font-mono font-semibold bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">Operational</span>
            </h3>
            <p className="text-[10px] text-zinc-500 mt-1">
              {installedPlugins} plugins active · Rollback systems armed · Monitoring pipeline live
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setCustomizeOpen(true)}
              className="bg-dark-800 text-zinc-300 border border-white/[0.06] hover:bg-dark-700 font-medium py-2 px-3 rounded-lg text-xs transition-all flex items-center gap-1.5">
              <LayoutGrid size={13} /> Customize
            </button>
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
        {/* Jira-style stat summary row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              icon: <RefreshCw size={16} className="text-zinc-400" />,
              value: deployments.filter(d => d.status === 'ready').length,
              label: 'deployments ready',
              sub: 'in the last 7 days',
              onClick: () => navigateTo('deployments'),
            },
            {
              icon: <Activity size={16} className="text-blue-400" />,
              value: activeDeployments,
              label: 'active pipelines',
              sub: 'currently building',
              onClick: () => navigateTo('deployments'),
            },
            {
              icon: <ShieldAlert size={16} className={openIncidents > 0 ? 'text-red-400' : 'text-zinc-500'} />,
              value: openIncidents,
              label: 'open incidents',
              sub: 'need attention',
              onClick: () => navigateTo('incidents'),
            },
            {
              icon: <Bell size={16} className={firingAlerts > 0 ? 'text-amber-400' : 'text-zinc-500'} />,
              value: firingAlerts,
              label: 'firing alerts',
              sub: 'from all monitors',
              onClick: () => navigateTo('monitoring'),
            },
          ].map((stat, i) => (
            <div key={i} onClick={stat.onClick}
              className="kpi-card p-4 cursor-pointer transition-all group">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: i === 1 ? 'rgba(59,130,246,0.15)' : i === 2 && openIncidents > 0 ? 'rgba(248,113,113,0.15)' : i === 3 && firingAlerts > 0 ? 'rgba(251,191,36,0.15)' : 'rgba(148,163,184,0.12)' }}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-xl font-bold text-white font-mono leading-none">{stat.value}</p>
                  <p className="text-xs text-zinc-300 mt-1 font-medium">{stat.label}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{stat.sub}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {visibleWidgets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-12 text-center">
          <p className="text-sm text-zinc-500">All widgets are hidden.</p>
          <button onClick={() => setCustomizeOpen(true)}
            className="mt-4 bg-white text-black rounded-lg px-4 py-2 text-xs font-semibold hover:bg-zinc-200 transition">
            Customize Dashboard
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
          {visibleWidgets.map(w => (
            <div key={w.id} className={`min-w-0 ${spanClasses(WIDGET_META[w.id].span)}`}>
              {renderWidget(w.id)}
            </div>
          ))}
        </div>
      )}

      {customizeOpen && (
        <CustomizeDialog layout={layout} onChange={applyLayout} onClose={() => setCustomizeOpen(false)} />
      )}
    </div>
  );
};

export default Dashboard;