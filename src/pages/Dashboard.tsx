import React from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  FolderGit2, AlertTriangle, RefreshCw, Activity,
  ArrowUpRight, ShieldAlert, Cpu, Puzzle, Bell
} from 'lucide-react';
import { 
  AreaChart, Area, LineChart, Line, BarChart, Bar, XAxis, YAxis, 
  CartesianGrid, Tooltip, ResponsiveContainer 
} from 'recharts';

export const Dashboard: React.FC = () => {
  const { 
    projects, deployments, incidents, rollbackOperations, 
    auditLogs, navigateTo, pluginInstallations, monitoringAlerts
  } = usePlatform();

  const totalProjects = projects.length;
  const activeDeployments = deployments.filter(d => d.status === 'building' || d.status === 'queued').length;
  const failedDeployments = deployments.filter(d => d.status === 'failed').length;
  const openIncidents = incidents.filter(i => i.status !== 'resolved').length;
  const installedPlugins = pluginInstallations.length;
  const firingAlerts = monitoringAlerts.filter(a => a.status === 'firing').length;

  const successChartData = [
    { name: 'Aug 13', successRate: 94 },
    { name: 'Aug 14', successRate: 92 },
    { name: 'Aug 15', successRate: 95 },
    { name: 'Aug 16', successRate: 98 },
    { name: 'Aug 17', successRate: 91 },
    { name: 'Aug 18', successRate: 88 },
    { name: 'Aug 19', successRate: 96 },
  ];

  const incidentTrendData = [
    { name: 'Aug 13', open: 1, resolved: 2 },
    { name: 'Aug 14', open: 2, resolved: 1 },
    { name: 'Aug 15', open: 0, resolved: 2 },
    { name: 'Aug 16', open: 1, resolved: 0 },
    { name: 'Aug 17', open: 3, resolved: 1 },
    { name: 'Aug 18', open: 2, resolved: 3 },
    { name: 'Aug 19', open: openIncidents, resolved: 1 },
  ];

  const alertTrendData = [
    { name: 'Aug 13', grafana: 1, datadog: 0, sentry: 0 },
    { name: 'Aug 14', grafana: 0, datadog: 1, sentry: 1 },
    { name: 'Aug 15', grafana: 2, datadog: 0, sentry: 0 },
    { name: 'Aug 16', grafana: 0, datadog: 2, sentry: 1 },
    { name: 'Aug 17', grafana: 1, datadog: 1, sentry: 2 },
    { name: 'Aug 18', grafana: 1, datadog: 0, sentry: 1 },
    { name: 'Aug 19', grafana: 1, datadog: 1, sentry: 2 },
  ];

  const providerStatuses = [
    { name: 'Vercel API',  status: 'connected', latency: '48ms',  detail: 'Webhooks: Active • RSA-256' },
    { name: 'Netlify CDN', status: 'error',     latency: '—',     detail: 'Webhook signature mismatch' },
    { name: 'Grafana',     status: 'connected', latency: '120ms', detail: 'Dashboards: 4 panels synced' },
    { name: 'Datadog',     status: 'connected', latency: '95ms',  detail: 'Monitors: 3 active' },
    { name: 'Sentry',      status: 'syncing',   latency: '—',     detail: 'Syncing releases...' },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-white tracking-wide flex items-center gap-2">
            <Cpu size={18} className="text-brand-500" />
            Infrastructure Status: Operational
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {installedPlugins} plugins active • Rollback systems armed • Monitoring pipeline live
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigateTo('integrations')}
            className="bg-dark-800 hover:bg-dark-700 border border-dark-700 text-slate-300 font-bold py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5">
            <Puzzle size={14} />Integrations
          </button>
          <button onClick={() => navigateTo('create-project')}
            className="bg-brand-600 hover:bg-brand-500 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all shadow-md shadow-brand-600/10 flex items-center gap-1.5">
            <FolderGit2 size={14} />Onboard Project
          </button>
        </div>
      </div>

      {/* 6-metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { label: 'Total Services',  value: totalProjects,      icon: FolderGit2,  color: 'text-brand-500',  page: 'projects',    sub: 'View catalog' },
          { label: 'Active Deploys',  value: activeDeployments,  icon: Activity,    color: 'text-blue-400',   page: 'deployments', sub: 'Pipelines running', animate: true },
          { label: 'Failed Deploys',  value: failedDeployments,  icon: AlertTriangle, color: 'text-rose-500', page: 'deployments', sub: 'Needs attention', valueColor: failedDeployments > 0 ? 'text-rose-400' : 'text-white' },
          { label: 'Open Incidents',  value: openIncidents,      icon: ShieldAlert, color: openIncidents > 0 ? 'text-rose-500' : 'text-slate-400', page: 'incidents', sub: 'Actionable', valueColor: openIncidents > 0 ? 'text-rose-400' : 'text-white' },
          { label: 'Firing Alerts',   value: firingAlerts,       icon: Bell,        color: firingAlerts > 0 ? 'text-amber-400' : 'text-slate-400', page: 'monitoring', sub: 'Monitor alerts', valueColor: firingAlerts > 0 ? 'text-amber-400' : 'text-white' },
          { label: 'Plugins Active',  value: installedPlugins,   icon: Puzzle,      color: 'text-violet-400', page: 'integrations', sub: 'Connected tools' },
        ].map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} onClick={() => navigateTo(card.page as any)}
              className="bg-dark-900 border border-dark-700 hover:border-dark-600 p-4 rounded-xl cursor-pointer transition-all hover:-translate-y-0.5 group">
              <div className="flex justify-between items-start text-slate-400">
                <span className="text-[10px] font-semibold uppercase tracking-wider leading-tight">{card.label}</span>
                <Icon size={16} className={card.color + (card.animate ? ' animate-pulse' : '')} />
              </div>
              <div className={`text-2xl font-bold mt-2 font-mono ${card.valueColor || 'text-white'}`}>{card.value}</div>
              <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                <span>{card.sub}</span>
                <ArrowUpRight size={10} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </div>
            </div>
          );
        })}
      </div>

      {/* 3-column chart row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Deployment Success Rate (%)</h4>
            <span className="text-[10px] font-mono text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded">Avg: 93.5%</span>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={successChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={10} tickLine={false} />
                <YAxis domain={[80, 100]} stroke="#6b7280" fontSize={10} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }} labelStyle={{ color: '#f3f4f6', fontSize: '11px' }} itemStyle={{ color: '#3b82f6', fontSize: '11px' }} />
                <Area type="monotone" dataKey="successRate" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorSuccess)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Incident Activity</h4>
            <div className="flex gap-3 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-rose-400"><span className="w-2 h-2 rounded-full bg-rose-500"></span>Opened</span>
              <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Resolved</span>
            </div>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={incidentTrendData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={10} tickLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }} labelStyle={{ color: '#f3f4f6', fontSize: '11px' }} itemStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="open" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="resolved" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Monitoring Alert Trend</h4>
            <button onClick={() => navigateTo('monitoring')} className="text-[10px] text-brand-500 hover:underline">View all</button>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={alertTrendData} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                <XAxis dataKey="name" stroke="#6b7280" fontSize={10} tickLine={false} />
                <YAxis stroke="#6b7280" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }} labelStyle={{ color: '#f3f4f6', fontSize: '11px' }} itemStyle={{ fontSize: '11px' }} />
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
        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 lg:col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Aether Platform Audit Trail</h4>
            <button onClick={() => navigateTo('notifications')} className="text-[10px] text-brand-500 hover:underline">Full logs</button>
          </div>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {auditLogs.slice(0, 6).map(log => (
              <div key={log.id} className="flex items-start gap-3 p-3 bg-dark-950/40 rounded-lg border border-dark-750 text-xs">
                <div className={`p-1.5 rounded bg-dark-800 shrink-0 ${
                  log.action.includes('ROLLBACK') ? 'text-purple-400' :
                  log.action.includes('INCIDENT') ? 'text-rose-400' :
                  log.action.includes('PLUGIN')   ? 'text-violet-400' :
                  log.action.includes('CREATE')   ? 'text-brand-500' : 'text-slate-400'
                }`}>
                  {log.action.includes('ROLLBACK') ? <RefreshCw size={12} /> :
                   log.action.includes('PLUGIN')   ? <Puzzle size={12} /> :
                   log.action.includes('CREATE')   ? <FolderGit2 size={12} /> : <Cpu size={12} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start mb-0.5">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-300">{log.action.replace(/_/g, ' ')}</span>
                    <span className="text-[9px] text-slate-500">{new Date(log.createdAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-slate-400 leading-normal">{log.details}</p>
                  {log.projectName && (
                    <span className="inline-block mt-1 font-mono text-[9px] bg-dark-800 px-1.5 py-0.5 rounded text-slate-400">{log.projectName}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-dark-900 border border-dark-700 rounded-xl p-5">
          <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-4">Integration Health</h4>
          <div className="space-y-3">
            {providerStatuses.map(p => (
              <div key={p.name} className="p-3 bg-dark-950/40 border border-dark-750 rounded-lg">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-bold text-slate-300">{p.name}</span>
                  <span className={`text-[10px] font-bold flex items-center gap-1 px-2 py-0.5 rounded font-mono ${
                    p.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400' :
                    p.status === 'error'     ? 'bg-rose-500/10 text-rose-400' :
                    'bg-amber-500/10 text-amber-400'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      p.status === 'connected' ? 'bg-emerald-500 animate-ping' :
                      p.status === 'error'     ? 'bg-rose-500' : 'bg-amber-500 animate-pulse'
                    }`}></span>
                    {p.status === 'connected' ? '200 OK' : p.status === 'error' ? 'ERROR' : 'SYNCING'}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">{p.detail}{p.latency !== '—' ? ` • ${p.latency}` : ''}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-dark-750 text-center">
            <button onClick={() => navigateTo('integrations')} className="text-[11px] font-semibold text-brand-500 hover:underline">
              Manage Integrations →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
