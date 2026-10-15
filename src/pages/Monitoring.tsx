import React, { useState, useEffect } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { isApiAvailable, api } from '../services/api';
import {
  Activity, Search, AlertTriangle, CheckCircle, Clock,
  ExternalLink, Bug, Filter, ChevronRight, ShieldAlert, Code,
  Zap, Play, RefreshCw, Loader
} from 'lucide-react';
import type { AlertSource, AlertSeverity, AlertStatus, SentryIssue } from '../types/platform';

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
    case 'newrelic': return <span className={base + 'bg-green-500/10 text-green-400 border-green-500/25'}>NR</span>;
    case 'sentry':   return <span className={base + 'bg-violet-500/10 text-violet-400 border-violet-500/25'}>SN</span>;
    case 'vercel':   return <span className={base + 'bg-white/5 text-zinc-300 border-white/[0.06]'}>VC</span>;
    case 'netlify':  return <span className={base + 'bg-teal-500/10 text-teal-400 border-teal-500/25'}>NF</span>;
    case 'datadog':  return <span className={base + 'bg-purple-500/10 text-purple-400 border-purple-500/25'}>DD</span>;
    case 'uptimerobot': return <span className={base + 'bg-green-500/10 text-green-400 border-green-500/25'}>UR</span>;
    case 'rollbar':  return <span className={base + 'bg-red-500/10 text-red-400 border-red-500/25'}>RB</span>;
    case 'bugsnag':  return <span className={base + 'bg-pink-500/10 text-pink-400 border-pink-500/25'}>BG</span>;
    case 'pagerduty': return <span className={base + 'bg-green-500/10 text-green-400 border-green-500/25'}>PD</span>;
    case 'opsgenie': return <span className={base + 'bg-blue-500/10 text-blue-400 border-blue-500/25'}>OG</span>;
    case 'prometheus': return <span className={base + 'bg-orange-500/10 text-orange-400 border-orange-500/25'}>PM</span>;
    case 'elastic':  return <span className={base + 'bg-blue-500/10 text-blue-300 border-blue-500/25'}>EL</span>;
    case 'dynatrace': return <span className={base + 'bg-teal-500/10 text-teal-400 border-teal-500/25'}>DT</span>;
    case 'honeycomb': return <span className={base + 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25'}>HC</span>;
    case 'statuspage': return <span className={base + 'bg-blue-500/10 text-blue-400 border-blue-500/25'}>SP</span>;
    case 'victorops': return <span className={base + 'bg-green-500/10 text-green-400 border-green-500/25'}>VO</span>;
    case 'sonarqube': return <span className={base + 'bg-blue-500/10 text-blue-400 border-blue-500/25'}>SQ</span>;
    case 'snyk':     return <span className={base + 'bg-violet-500/10 text-violet-400 border-violet-500/25'}>SK</span>;
    case 'argocd':   return <span className={base + 'bg-orange-500/10 text-orange-400 border-orange-500/25'}>AC</span>;
    case 'raygun':   return <span className={base + 'bg-orange-500/10 text-orange-400 border-orange-500/25'}>RG</span>;
    case 'airbrake': return <span className={base + 'bg-red-500/10 text-red-400 border-red-500/25'}>AB</span>;
    case 'kubernetes': return <span className={base + 'bg-blue-500/10 text-blue-400 border-blue-500/25'}>K8</span>;
    case 'cloudwatch': return <span className={base + 'bg-amber-500/10 text-amber-400 border-amber-500/25'}>CW</span>;
    default:         return <span className={base + 'bg-white/5 text-zinc-400 border-white/[0.06]'}>{String(source).slice(0,2).toUpperCase()}</span>;
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
  const { monitoringAlerts: contextAlerts, navigateTo, projects, pluginInstallations, refreshData: refreshPlatformData } = usePlatform();
  const [tab, setTab] = useState<'alerts' | 'sentry'>('alerts');
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<AlertSource | 'all'>('all');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<AlertStatus | 'all'>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null);
  const [targetProjectId, setTargetProjectId] = useState<string>('');
  const [triggeringAction, setTriggeringAction] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [testMessageType, setTestMessageType] = useState<'success' | 'error' | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [liveAlerts, setLiveAlerts] = useState<typeof contextAlerts | null>(null);
  const [liveSentryIssues, setLiveSentryIssues] = useState<SentryIssue[] | null>(null);
  const [sentryLoading, setSentryLoading] = useState(false);

  // Auto-detect target test URL from Vercel plugin or projects
  const vercelPlugin = pluginInstallations.find(p => p.pluginId === 'vercel');
  const detectedUrl = vercelPlugin?.baseUrl || (
    vercelPlugin?.projectSelector
      ? (vercelPlugin.projectSelector.startsWith('http')
          ? vercelPlugin.projectSelector
          : `https://${vercelPlugin.projectSelector.replace(/\.vercel\.app$/, '')}.vercel.app`)
      : ''
  );
  const [targetAppUrl, setTargetAppUrl] = useState(detectedUrl);

  useEffect(() => {
    if (detectedUrl && !targetAppUrl) {
      setTargetAppUrl(detectedUrl);
    }
  }, [detectedUrl]);

  useEffect(() => {
    if (projects.length > 0 && !targetProjectId) {
      setTargetProjectId(projects[0].id);
    }
  }, [projects, targetProjectId]);

  const refreshAlerts = async () => {
    if (!isApiAvailable()) return;
    setIsRefreshing(true);
    try {
      const data = await api.monitoring.getAlerts();
      if (Array.isArray(data)) {
        const mapped = data.map((r: Record<string, unknown>) => ({
          id: r.id,
          projectId: (r.project_id || r.projectId || '') as string,
          projectName: (r.project_name || r.projectName || 'Service') as string,
          title: (r.title || 'System Alert') as string,
          description: (r.description || '') as string,
          severity: ((r.severity || 'medium') as AlertSeverity),
          status: ((r.status || 'firing') as AlertStatus),
          source: ((r.source || 'grafana') as AlertSource),
          firedAt: (r.fired_at || r.firedAt || new Date().toISOString()) as string,
          resolvedAt: (r.resolved_at || r.resolvedAt) as string | undefined,
          metricName: (r.metric_name || r.metricName) as string | undefined,
          metricValue: (r.metric_value || r.metricValue) as string | undefined,
          dashboardUrl: (r.dashboard_url || r.dashboardUrl) as string | undefined,
        }));
        setLiveAlerts(mapped as typeof contextAlerts);
      }
    } catch (err) {
      console.warn('[monitoring] refreshAlerts error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isApiAvailable()) return;
    refreshAlerts();
    const timer = setInterval(refreshAlerts, 6000);
    return () => clearInterval(timer);
  }, []);

  const handleRunTest = async (testType: string) => {
    const targetId = targetProjectId || projects[0]?.id;
    if (!targetId) return;
    setTriggeringAction(testType);
    setTestMessage(null);
    try {
      await api.monitoring.triggerTest(targetId, testType, targetAppUrl || undefined);
      setTestMessage(`Test event "${testType}" fired against ${targetAppUrl || 'target service'}! Alert and incident created.`);
      setTestMessageType('success');
      await refreshAlerts();
      if (refreshPlatformData) await refreshPlatformData();
    } catch (err: any) {
      setTestMessage(`Test trigger failed: ${err?.message || err}`);
      setTestMessageType('error');
    } finally {
      setTriggeringAction(null);
    }
  };

  const handleRunProbe = async () => {
    const targetId = targetProjectId || projects[0]?.id;
    if (!targetId) return;
    setTriggeringAction('probe');
    setTestMessage(null);
    try {
      await api.monitoring.probe(targetId, targetAppUrl || undefined);
      setTestMessage(`Live health probe complete on ${targetAppUrl || 'target service'}! All endpoints verified.`);
      setTestMessageType('success');
      await refreshAlerts();
      if (refreshPlatformData) await refreshPlatformData();
    } catch (err: any) {
      setTestMessage(`Health probe failed: ${err?.message || err}`);
      setTestMessageType('error');
    } finally {
      setTriggeringAction(null);
    }
  };

  const monitoringAlerts = liveAlerts ?? contextAlerts;

  // Live Sentry issues from connected Sentry installations (empty until
  // fetched; the tab's empty state covers the no-plugin case honestly).
  useEffect(() => {
    if (!isApiAvailable()) return;
    let cancelled = false;
    setSentryLoading(true);
    api.monitoring.sentryIssues()
      .then(data => {
        if (cancelled || !Array.isArray(data)) return;
        setLiveSentryIssues(data.map((r, idx) => ({
          id: String(r.id ?? `sentry-${idx}`),
          title: String(r.title ?? 'Sentry Issue'),
          culprit: String(r.culprit ?? ''),
          level: (['fatal', 'error', 'warning', 'info'] as const).includes(r.level as SentryIssue['level'])
            ? r.level as SentryIssue['level'] : 'error' as const,
          status: (['unresolved', 'resolved', 'ignored'] as const).includes(r.status as SentryIssue['status'])
            ? r.status as SentryIssue['status'] : 'unresolved' as const,
          count: Number(r.count) || 0,
          firstSeen: String(r.firstSeen ?? ''),
          lastSeen: String(r.lastSeen ?? ''),
          release: String(r.release ?? ''),
        })));
      })
      .catch(() => { /* empty state covers failure */ })
      .finally(() => { if (!cancelled) setSentryLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const sentryIssues: SentryIssue[] = liveSentryIssues ?? [];

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
      <div className="relative overflow-hidden bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="card-glow" style={{ background: '#FBBF24' }}></div>
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
          <div className="bg-red-500/10 border border-red-500/20 shadow-glow-red px-3 py-1.5 rounded-lg">
            <span className="text-red-400 font-bold">{firing}</span>
            <span className="text-zinc-500 ml-1">firing</span>
          </div>
          <div className="bg-emerald-500/10 border border-emerald-500/20 shadow-glow-green px-3 py-1.5 rounded-lg">
            <span className="text-emerald-400 font-bold">{resolved}</span>
            <span className="text-zinc-500 ml-1">resolved</span>
          </div>
          <div className="bg-white/[0.03] border border-white/[0.06] px-3 py-1.5 rounded-lg">
            <span className="text-zinc-200 font-bold">{sentryIssues.filter(i => i.status === 'unresolved').length}</span>
            <span className="text-zinc-500 ml-1">sentry issues</span>
          </div>
        </div>
      </div>

      {/* Live Testing & Observability Trigger Panel */}
      <div className="relative overflow-hidden bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
        <div className="card-glow" style={{ background: '#3B82F6' }}></div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Zap size={14} className="text-amber-400" />
              Live Testing Service & Event Generator
            </h4>
            <p className="text-xs text-zinc-400 mt-0.5">
              Probe deployed test application and trigger real events that flow through backend monitoring into Supabase.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={targetProjectId}
              onChange={e => setTargetProjectId(e.target.value)}
              className="bg-black/40 border border-white/[0.08] text-zinc-200 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.vercelProjectId ? `(${p.vercelProjectId})` : ''}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1.5 bg-black/40 border border-white/[0.08] px-2.5 py-1 rounded-lg">
              <span className="text-[10px] text-zinc-500 font-mono">Target:</span>
              <input
                type="text"
                value={targetAppUrl}
                onChange={e => setTargetAppUrl(e.target.value)}
                placeholder="https://your-app.vercel.app"
                className="bg-transparent text-zinc-200 text-xs font-mono focus:outline-none w-52"
              />
            </div>
            {targetAppUrl ? (
              <a
                href={targetAppUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-zinc-400 hover:text-zinc-200 flex items-center gap-1 border border-white/[0.06] px-2.5 py-1.5 rounded-lg hover:bg-white/[0.03] transition-all"
              >
                <ExternalLink size={12} /> Open Site
              </a>
            ) : (
              <span
                title="Set a target URL to open it"
                className="text-xs text-zinc-600 flex items-center gap-1 border border-white/[0.06] px-2.5 py-1.5 rounded-lg cursor-not-allowed"
              >
                <ExternalLink size={12} /> Open Site
              </span>
            )}
            <button
              onClick={refreshAlerts}
              title="Refresh alerts"
              className="p-1.5 rounded-lg border border-white/[0.06] hover:bg-white/[0.04] text-zinc-400 hover:text-white transition-all"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Test Buttons Row */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            onClick={() => handleRunTest('normal')}
            disabled={!!triggeringAction}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {triggeringAction === 'normal' ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            Normal Request (200 OK)
          </button>
          <button
            onClick={() => handleRunTest('trigger_500')}
            disabled={!!triggeringAction}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {triggeringAction === 'trigger_500' ? <RefreshCw size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
            Trigger 500 (Broken)
          </button>
          <button
            onClick={() => handleRunTest('slow_request')}
            disabled={!!triggeringAction}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {triggeringAction === 'slow_request' ? <RefreshCw size={12} className="animate-spin" /> : <Clock size={12} />}
            8s Slow Request
          </button>
          <button
            onClick={() => handleRunTest('error_storm')}
            disabled={!!triggeringAction}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {triggeringAction === 'error_storm' ? <RefreshCw size={12} className="animate-spin" /> : <ShieldAlert size={12} />}
            Error Storm (5x Burst)
          </button>
          <button
            onClick={() => handleRunTest('memory_waste')}
            disabled={!!triggeringAction}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-orange-500/20 bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {triggeringAction === 'memory_waste' ? <RefreshCw size={12} className="animate-spin" /> : <Zap size={12} />}
            Memory Waste (92%)
          </button>
          <button
            onClick={() => handleRunTest('test_grafana_api')}
            disabled={!!triggeringAction}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-blue-500/20 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
          >
            {triggeringAction === 'test_grafana_api' ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
            Test Grafana API
          </button>
          <button
            onClick={handleRunProbe}
            disabled={!!triggeringAction}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-white/[0.1] bg-white/[0.05] text-zinc-200 hover:bg-white/[0.1] disabled:opacity-50 transition-all flex items-center gap-1.5 ml-auto"
          >
            {triggeringAction === 'probe' ? <RefreshCw size={12} className="animate-spin" /> : <Activity size={12} />}
            Run Health Probe
          </button>
        </div>

        {testMessage && (
          <div className={`p-2.5 rounded-lg text-xs font-mono flex items-center gap-2 border ${
            testMessageType === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
              : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {testMessageType === 'success' ? <CheckCircle size={13} /> : <AlertTriangle size={13} />}
            {testMessage}
          </div>
        )}
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
              <select value={sourceFilter} onChange={e => setSourceFilter(e.target.value as AlertSource | 'all')}
                className="bg-black/30 border border-white/[0.06] text-zinc-300 focus:outline-none focus:border-white/20 rounded-md p-2 text-xs">
                <option value="all">All Sources</option>
                <option value="grafana">Grafana</option>
                <option value="datadog">Datadog</option>
                <option value="sentry">Sentry</option>
                <option value="vercel">Vercel</option>
                <option value="netlify">Netlify</option>
                <option value="uptimerobot">UptimeRobot</option>
                <option value="rollbar">Rollbar</option>
                <option value="bugsnag">Bugsnag</option>
                <option value="pagerduty">PagerDuty</option>
                <option value="opsgenie">OpsGenie</option>
                <option value="prometheus">Prometheus</option>
                <option value="elastic">Elastic</option>
                <option value="dynatrace">Dynatrace</option>
                <option value="honeycomb">Honeycomb</option>
                <option value="statuspage">Statuspage</option>
                <option value="victorops">Splunk On-Call</option>
                <option value="sonarqube">SonarQube</option>
                <option value="snyk">Snyk</option>
                <option value="argocd">ArgoCD</option>
                <option value="raygun">Raygun</option>
                <option value="airbrake">Airbrake</option>
                <option value="kubernetes">Kubernetes</option>
                <option value="cloudwatch">CloudWatch</option>
              </select>
              <select value={severityFilter} onChange={e => setSeverityFilter(e.target.value as AlertSeverity | 'all')}
                className="bg-black/30 border border-white/[0.06] text-zinc-300 focus:outline-none focus:border-white/20 rounded-md p-2 text-xs">
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as AlertStatus | 'all')}
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
              <div className="relative overflow-hidden bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4 sticky top-0">
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
          <div className="relative overflow-hidden bg-violet-500/5 border border-violet-500/20 rounded-xl p-4 text-xs text-zinc-400 flex items-start gap-2">
            <Bug size={14} className="text-violet-400 shrink-0 mt-0.5" />
            <span>
              Showing Sentry issues pulled via the <b className="text-zinc-200">Sentry Plugin</b>.
              Issues are linked to projects and deployments.
            </span>
          </div>

          {sentryLoading ? (
            <div className="relative overflow-hidden bg-white/[0.03] border border-white/[0.06] rounded-xl p-12 text-center text-zinc-500">
              <Loader size={20} className="mx-auto mb-3 text-zinc-600 animate-spin" />
              <p className="text-xs text-zinc-400">Loading Sentry issues…</p>
            </div>
          ) : sentryIssues.length === 0 ? (
            <div className="relative overflow-hidden bg-white/[0.03] border border-white/[0.06] rounded-xl p-12 text-center text-zinc-500">
              <Bug size={28} className="mx-auto mb-3 text-zinc-600" />
              <p className="text-xs font-semibold text-zinc-300">No Sentry Issues Reported</p>
              <p className="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
                Connect your Sentry integration in the Integrations panel to stream live production errors and stack traces.
              </p>
              <div className="mt-4">
                <button
                  onClick={() => navigateTo('integrations')}
                  className="px-3.5 py-1.5 rounded-lg border border-white/[0.08] hover:bg-white/[0.04] text-zinc-300 text-xs font-medium transition-all"
                >
                  Configure Sentry Integration
                </button>
              </div>
            </div>
          ) : (
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
          )}
        </div>
      )}
    </div>
  );
};
