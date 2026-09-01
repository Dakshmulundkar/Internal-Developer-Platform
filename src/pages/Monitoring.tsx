import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { initialSentryIssues } from '../data/seedData';
import {
  Activity, Search, AlertTriangle, CheckCircle, Clock,
  ExternalLink, Bug, Filter, ChevronRight, ShieldAlert, Code
} from 'lucide-react';
import type { AlertSource, AlertSeverity, AlertStatus } from '../types/platform';

const severityColor = (s: AlertSeverity) => {
  switch (s) {
    case 'critical': return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'high':     return 'bg-orange-500/10 text-orange-400 border-orange-500/25';
    case 'medium':   return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'low':      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    default:         return 'text-zinc-500 bg-white/5 border-white/[0.06]';
  }
};

const statusColor = (s: AlertStatus) => {
  switch (s) {
    case 'firing':   return 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse';
    case 'resolved': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'pending':  return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    default:         return 'text-zinc-500 bg-white/5 border-white/[0.06]';
  }
};

const sourceIcon = (source: AlertSource) => {
  const base = 'text-[9px] font-black font-mono px-1.5 py-0.5 rounded border ';
  switch (source) {
    case 'grafana':  return <span className={base + 'bg-orange-500/10 text-orange-400 border-orange-500/25'}>GF</span>;
    case 'datadog':  return <span className={base + 'bg-purple-500/10 text-purple-400 border-purple-500/25'}>DD</span>;
    case 'sentry':   return <span className={base + 'bg-violet-500/10 text-violet-400 border-violet-500/25'}>SN</span>;
    case 'vercel':   return <span className={base + 'bg-white/5 text-zinc-300 border-white/[0.06]'}>VC</span>;
    case 'netlify':  return <span className={base + 'bg-teal-500/10 text-teal-400 border-teal-500/25'}>NF</span>;
  }
};

const sentryLevelColor = (level: string) => {
  switch (level) {
    case 'fatal':   return 'text-red-400 bg-red-500/10 border-red-500/20';
    case 'error':   return 'text-orange-400 bg-orange-500/10 border-orange-500/25';
    case 'warning': return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
    default:        return 'text-zinc-500 bg-white/5 border-white/[0.06]';
  }
};

export const Monitoring: React.FC = () => {
  const { monitoringAlerts, navigateTo, projects } = usePlatform();
  const [tab, setTab] = useState<'alerts' | 'sentry'>('alerts');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<AlertSource | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);

  const sentryIssues = initialSentryIssues;

  const firing   = monitoringAlerts.filter(a => a.status === 'firing').length;
  const resolved = monitoringAlerts.filter(a => a.status === 'resolved').length;
  const critical = monitoringAlerts.filter(a => a.severity === 'critical').length;

  const filteredAlerts = monitoringAlerts.filter(a => {
    const matchSearch = a.title.toLowerCase().includes(search.toLowerCase()) ||
      (a.projectName || '').toLowerCase().includes(search.toLowerCase());
    const matchSource   = sourceFilter === 'all' || a.source === sourceFilter;
    const matchSeverity = severityFilter === 'all' || a.severity === severityFilter;
    const matchStatus   = statusFilter === 'all' || a.status === statusFilter;
    const matchProject  = projectFilter === 'all' || a.projectId === projectFilter;
    return matchSearch && matchSource && matchSeverity && matchStatus && matchProject;
  });

  const activeDetail = monitoringAlerts.find(a => a.id === selectedAlert);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <Activity size={18} className="text-amber-400" />
            Monitoring & Observability
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            Unified view of alerts from Grafana, Datadog, Sentry, and deployment providers.
          </p>
        </div>
        <div className="flex gap-3 text-xs font-mono shrink-0">
          <div className="bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
            <span className="text-red-400 font-bold">{firing}</span>
            <span className="text-zinc-500 ml-1">firing</span>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
            <span className="text-emerald-400 font-bold">{resolved}</span>
            <span className="text-zinc-500 ml-1">resolved</span>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] px-3 py-1.5 rounded-lg">
            <span className="text-zinc-200 font-bold">{sentryIssues.filter(i => i.status === 'unresolved').length}</span>
            <span className="text-zinc-500 ml-1">sentry issues</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border border-white/[0.06] rounded-lg overflow-hidden w-fit text-xs font-semibold">
        {([
          { id: 'alerts', label: `Monitoring Alerts (${monitoringAlerts.length})` },
          { id: 'sentry', label: `Sentry Issues (${sentryIssues.length})` },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 transition-all ${tab === t.id ? 'bg-white text-black' : 'bg-white/[0.03] text-zinc-400 hover:bg-white/5'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'alerts' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Filters + list */}
          <div className="lg:col-span-2 space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-2.5 text-zinc-600" size={14} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search alerts..."
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md py-2 pl-9 pr-4 text-xs font-mono" />
              </div>
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as any)}
                className="bg-black/30 border border-white/[0.06] text-zinc-300 focus:outline-none focus:border-white/20 rounded-md p-2 text-xs">
                <option value="all">All Sources</option>
                <option value="grafana">Grafana</option>
                <option value="datadog">Datadog</option>
                <option value="sentry">Sentry</option>
                <option value="vercel">Vercel</option>
                <option value="netlify">Netlify</option>
              </select>
              <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value as any)}
                className="bg-black/30 border border-white/[0.06] text-zinc-300 focus:outline-none focus:border-white/20 rounded-md p-2 text-xs">
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                className="bg-black/30 border border-white/[0.06] text-zinc-300 focus:outline-none focus:border-white/20 rounded-md p-2 text-xs">
                <option value="all">All States</option>
                <option value="firing">Firing</option>
                <option value="resolved">Resolved</option>
                <option value="pending">Pending</option>
              </select>
              <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
                className="bg-black/30 border border-white/[0.06] text-zinc-300 focus:outline-none focus:border-white/20 rounded-md p-2 text-xs">
                <option value="all">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>

            {/* Alert list */}
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
              {filteredAlerts.length === 0 ? (
                <div className="p-8 text-center text-zinc-600">
                  <Activity size={24} className="mx-auto mb-2 text-zinc-700" />
                  <p className="text-xs">No alerts matched your filters.</p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {filteredAlerts.map(alert => (
                    <div key={alert.id}
                      onClick={() => setSelectedAlert(alert.id === selectedAlert ? null : alert.id)}
                      className={`p-4 cursor-pointer hover:bg-white/[0.02] transition-all ${
                        selectedAlert === alert.id ? 'bg-white/[0.03] border-l-2 border-zinc-500' : ''
                      }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            {sourceIcon(alert.source)}
                            <span className={`text-[9px] font-semibold font-mono px-1.5 py-0.5 rounded border uppercase ${severityColor(alert.severity)}`}>
                              {alert.severity}
                            </span>
                            <span className={`text-[9px] font-semibold font-mono px-1.5 py-0.5 rounded border uppercase ${statusColor(alert.status)}`}>
                              {alert.status}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-white">{alert.title}</p>
                          {alert.projectName && (
                            <p className="text-[10px] text-zinc-600 mt-0.5">Project: {alert.projectName}</p>
                          )}
                          {alert.value && (
                            <p className="text-[10px] font-mono text-zinc-500 mt-0.5">
                              Value: <b className="text-red-400">{alert.value}</b>
                              {alert.threshold && <span className="text-zinc-600"> · Threshold: {alert.threshold}</span>}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-zinc-600 font-mono">
                            {new Date(alert.firedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                          {alert.incidentId && (
                            <button onClick={e => { e.stopPropagation(); navigateTo('incidents', { incidentId: alert.incidentId }); }}
                              className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline flex items-center gap-0.5 justify-end mt-1">
                              Incident <ChevronRight size={10} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Alert detail panel */}
          <div className="lg:col-span-1">
            {activeDetail ? (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4 sticky top-0">
                <div className="border-b border-white/[0.06] pb-3">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {sourceIcon(activeDetail.source)}
                    <span className={`text-[9px] font-semibold font-mono px-1.5 py-0.5 rounded border uppercase ${severityColor(activeDetail.severity)}`}>{activeDetail.severity}</span>
                    <span className={`text-[9px] font-semibold font-mono px-1.5 py-0.5 rounded border uppercase ${statusColor(activeDetail.status)}`}>{activeDetail.status}</span>
                  </div>
                  <h4 className="text-xs font-semibold text-white">{activeDetail.title}</h4>
                </div>

                <p className="text-xs text-zinc-400 leading-relaxed">{activeDetail.description}</p>

                <div className="space-y-2 text-[11px]">
                  {activeDetail.projectName && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Project</span>
                      <span className="text-zinc-300 font-semibold">{activeDetail.projectName}</span>
                    </div>
                  )}
                  {activeDetail.value && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Observed Value</span>
                      <span className="text-red-400 font-mono font-bold">{activeDetail.value}</span>
                    </div>
                  )}
                  {activeDetail.threshold && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Threshold</span>
                      <span className="text-amber-400 font-mono">{activeDetail.threshold}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Fired At</span>
                    <span className="text-zinc-300 font-mono">{new Date(activeDetail.firedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {activeDetail.resolvedAt && (
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Resolved</span>
                      <span className="text-emerald-400 font-mono">{new Date(activeDetail.resolvedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  )}
                  {activeDetail.labels && Object.keys(activeDetail.labels).length > 0 && (
                    <div>
                      <span className="text-zinc-500 block mb-1">Labels</span>
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(activeDetail.labels).map(([k, v]) => (
                          <span key={k} className="text-[9px] font-mono bg-black/20 border border-white/5 text-zinc-500 px-1.5 py-0.5 rounded">
                            {k}={v}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 pt-3 border-t border-white/[0.06]">
                  {activeDetail.incidentId && (
                    <button onClick={() => navigateTo('incidents', { incidentId: activeDetail.incidentId })}
                      className="w-full text-xs font-medium text-red-400 border border-red-500/20 hover:border-red-500/30 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all">
                      <ShieldAlert size={12} />
                      View Linked Incident
                    </button>
                  )}
                  {activeDetail.deploymentId && (
                    <button onClick={() => navigateTo('deployment-details', { deploymentId: activeDetail.deploymentId })}
                      className="w-full text-xs font-medium text-zinc-400 border border-white/[0.06] hover:border-white/10 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all">
                      View Deployment Logs
                    </button>
                  )}
                  <button onClick={() => navigateTo('ai-assistant', { projectId: activeDetail.projectId })}
                    className="w-full text-xs font-medium text-violet-400 border border-violet-500/20 hover:border-violet-500/30 py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 transition-all">
                    Ask AI Assistant
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-8 text-center text-zinc-600">
                <Activity size={28} className="mx-auto mb-2 text-zinc-700" />
                <p className="text-xs font-semibold text-zinc-300">Select an alert</p>
                <p className="text-[11px] mt-1">Click any alert to view details and linked resources.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'sentry' && (
        <div className="space-y-4">
          <div className="bg-violet-500/5 border border-violet-500/20 rounded-xl p-4 text-xs text-zinc-400 flex items-start gap-2">
            <Bug size={14} className="text-violet-400 shrink-0 mt-0.5" />
            <span>
              Showing Sentry issues pulled via the <b className="text-zinc-200">Sentry Plugin</b>.
              Issues are linked to projects and deployments. <b className="text-zinc-200">[DEMO DATA]</b>
            </span>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] font-semibold text-zinc-500 uppercase tracking-wider bg-white/[0.02]">
                  <th className="p-4">ISSUE</th>
                  <th className="p-4">LEVEL</th>
                  <th className="p-4">STATUS</th>
                  <th className="p-4">COUNT</th>
                  <th className="p-4">RELEASE</th>
                  <th className="p-4">LAST SEEN</th>
                  <th className="p-4">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {sentryIssues.map(issue => (
                  <tr key={issue.id} className="hover:bg-white/[0.02] transition-all">
                    <td className="p-4 max-w-xs">
                      <p className="font-semibold text-white line-clamp-1">{issue.title}</p>
                      <p className="text-[10px] text-zinc-600 font-mono mt-0.5">{issue.culprit}</p>
                      {issue.stackTrace && (
                        <details className="mt-1">
                          <summary className="text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer hover:underline flex items-center gap-1">
                            <Code size={10} /> Stack trace
                          </summary>
                          <pre className="mt-1 text-[9px] text-zinc-500 bg-black/20 border border-white/5 p-2 rounded overflow-x-auto leading-relaxed whitespace-pre-wrap font-mono">
                            {issue.stackTrace}
                          </pre>
                        </details>
                      )}
                    </td>
                    <td className="p-4">
                      <span className={`text-[9px] font-semibold font-mono px-1.5 py-0.5 rounded border uppercase ${sentryLevelColor(issue.level)}`}>
                        {issue.level}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`text-[9px] font-semibold font-mono px-1.5 py-0.5 rounded border uppercase ${
                        issue.status === 'unresolved' ? 'text-red-400 bg-red-500/10 border-red-500/20' :
                        issue.status === 'resolved' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                        'text-zinc-500 bg-white/5 border-white/[0.06]'
                      }`}>
                        {issue.status}
                      </span>
                    </td>
                    <td className="p-4 font-mono text-zinc-300 font-bold">{issue.count.toLocaleString()}</td>
                    <td className="p-4 font-mono text-[10px] text-zinc-500">{issue.release || '—'}</td>
                    <td className="p-4 text-zinc-600 font-mono text-[10px]">
                      {new Date(issue.lastSeen).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {issue.deploymentId && (
                          <button onClick={() => navigateTo('deployment-details', { deploymentId: issue.deploymentId })}
                            className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline font-mono">Deployment</button>
                        )}
                        <button onClick={() => navigateTo('ai-assistant', { projectId: issue.projectId })}
                          className="text-[10px] text-violet-400 hover:underline font-mono">Ask AI</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
