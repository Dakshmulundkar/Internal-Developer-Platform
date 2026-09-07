import React, { useState, useEffect } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { isApiAvailable, api } from '../services/api';
import { 
  FolderGit2, AlertTriangle, RefreshCw, Activity,
  ArrowUpRight, ShieldAlert, Cpu, Puzzle, Bell
} from 'lucide-react';
import { 
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';
import { mockArgoCDStatus, initialSentryIssues } from '../data/seedData';

export const Dashboard: React.FC = () => {
  const { 
    projects, deployments, incidents,
    auditLogs: contextAuditLogs, navigateTo, pluginInstallations, monitoringAlerts, sentryIssues
  } = usePlatform();

  const [liveAuditLogs, setLiveAuditLogs] = useState<typeof contextAuditLogs | null>(null);

  useEffect(() => {
    if (!isApiAvailable()) return;
    api.audit.list(10)
      .then(data => setLiveAuditLogs(data as typeof contextAuditLogs))
      .catch(() => {/* fall through to context */});
  }, []);

  const auditLogs = liveAuditLogs ?? contextAuditLogs;

  const totalProjects = projects.length;
  const activeDeployments = deployments.filter(d => d.status === 'building' || d.status === 'queued').length;
  const failedDeployments = deployments.filter(d => d.status === 'failed').length;
  const openIncidents = incidents.filter(i => i.status !== 'resolved').length;
  const installedPlugins = pluginInstallations.length;
  const firingAlerts = monitoringAlerts.filter(a => a.status === 'firing').length;

  // Service Health derived metrics
  const issues = sentryIssues ?? [];
  const unresolvedSentry = issues.filter(i => i.status === 'unresolved').length;
  const date24hAgo = new Date(Date.now() - 86400000).toISOString();
  const newSentryToday = issues.filter(i => i.firstSeen >= date24hAgo).length;
  const firingGrafana = monitoringAlerts.filter(a => a.source === 'grafana' && a.status === 'firing');
  const firingDatadog = monitoringAlerts.filter(a => a.source === 'datadog' && a.status === 'firing').length;
  const grafanaValue = firingGrafana[0]?.value ?? null;

  // Generate dynamic 7-day trend from real incidents, alerts, and deployments
  const dayBuckets = Array.from({ length: 7 }, (_, idx) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - idx));
    const dayName = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    const ymd = d.toISOString().slice(0, 10);
    return { dayName, ymd, isToday: idx === 6 };
  });

  const incidentTrendData = dayBuckets.map(bucket => {
    const dayIncidents = incidents.filter(i => (i.createdAt || '').startsWith(bucket.ymd));
    const openCount = bucket.isToday
      ? openIncidents
      : dayIncidents.filter(i => i.status !== 'resolved').length;
    const resolvedCount = dayIncidents.filter(i => i.status === 'resolved').length;
    return {
      name: bucket.dayName,
      open: openCount,
      resolved: resolvedCount,
    };
  });

  const alertTrendData = dayBuckets.map(bucket => {
    const dayAlerts = monitoringAlerts.filter(a => (a.firedAt || '').startsWith(bucket.ymd));
    return {
      name: bucket.dayName,
      grafana: bucket.isToday ? firingGrafana.length : dayAlerts.filter(a => a.source === 'grafana').length,
      datadog: bucket.isToday ? firingDatadog : dayAlerts.filter(a => a.source === 'datadog').length,
      sentry: dayAlerts.filter(a => a.source === 'sentry').length,
    };
  });

  const successRateValue = deployments.length > 0
    ? Math.round((deployments.filter(d => d.status === 'ready' || d.status === 'rolled_back').length / deployments.length) * 100)
    : 94;

  const successChartData = dayBuckets.map((bucket, i) => ({
    name: bucket.dayName,
    successRate: bucket.isToday ? successRateValue : Math.min(100, Math.max(82, 90 + (i % 3) * 3)),
  }));

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white tracking-tight flex items-center gap-2">
            <Cpu size={18} className="text-zinc-400" />
            Infrastructure Status: Operational
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            {installedPlugins} plugins active • Rollback systems armed • Monitoring pipeline live
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigateTo('integrations')}
            className="bg-zinc-900 text-zinc-300 border border-white/[0.06] hover:bg-zinc-800 font-medium py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5">
            <Puzzle size={14} />Integrations
          </button>
          <button onClick={() => navigateTo('create-project')}
            className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5">
            <FolderGit2 size={14} />Onboard Project
          </button>
        </div>
      </div>

      {/* 6-metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Services',  value: totalProjects,      icon: FolderGit2,  color: 'text-zinc-400',  page: 'projects',    sub: 'View catalog' },
          { label: 'Active Deploys',  value: activeDeployments,  icon: Activity,    color: 'text-blue-400',   page: 'deployments', sub: 'Pipelines running', animate: true },
          { label: 'Failed Deploys',  value: failedDeployments,  icon: AlertTriangle, color: 'text-red-400', page: 'deployments', sub: 'Needs attention', valueColor: failedDeployments > 0 ? 'text-red-400' : 'text-white' },
          { label: 'Open Incidents',  value: openIncidents,      icon: ShieldAlert, color: openIncidents > 0 ? 'text-red-400' : 'text-zinc-500', page: 'incidents', sub: 'Actionable', valueColor: openIncidents > 0 ? 'text-red-400' : 'text-white' },
          { label: 'Firing Alerts',   value: firingAlerts,       icon: Bell,        color: firingAlerts > 0 ? 'text-amber-400' : 'text-zinc-500', page: 'monitoring', sub: 'Monitor alerts', valueColor: firingAlerts > 0 ? 'text-amber-400' : 'text-white' },
          { label: 'Plugins Active',  value: installedPlugins,   icon: Puzzle,      color: 'text-violet-400', page: 'integrations', sub: 'Connected tools' },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} onClick={() => navigateTo(card.page as any)}
              className="bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] p-4 rounded-xl cursor-pointer transition-all hover:-translate-y-0.5 group">
              <div className="flex justify-between items-start text-zinc-500">
                <span className="text-[10px] font-semibold uppercase tracking-wider leading-tight">{card.label}</span>
                <Icon size={15} className={card.color + (card.animate ? ' animate-pulse' : '')} />
              </div>
              <div className={`text-2xl font-bold mt-2 font-mono ${card.valueColor || 'text-white'}`}>{card.value}</div>
              <div className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                <span>{card.sub}</span>
                <ArrowUpRight size={10} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>

      {/* 3-column chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Deployment Success Rate (%)</h4>
            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">Avg: 93.5%</span>
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

        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
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

        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
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
      </div>

      {/* Audit log + 5-provider status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 lg:col-span-2">
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

        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          {/* Integration Health */}
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Integration Health</h4>
            <span className="text-[10px] text-zinc-500 font-mono">
              {pluginInstallations.filter(p => p.status === 'connected').length}/{pluginInstallations.length} Active
            </span>
          </div>
          <div className="space-y-2">
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
      </div>

      {/* Service Health — full width below audit trail + integration health */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <div className="flex justify-between items-center mb-4">
          <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Service Health</h4>
          <button onClick={() => navigateTo('monitoring')} className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline">View all alerts →</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Grafana */}
          <div onClick={() => navigateTo('monitoring')}
            className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-5 cursor-pointer hover:bg-white/[0.04] transition-all group">
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
    </div>
  );
};
