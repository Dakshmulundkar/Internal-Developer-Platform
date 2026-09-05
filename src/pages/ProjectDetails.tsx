import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import {
  ArrowLeft, Github, ExternalLink, RefreshCw, AlertTriangle,
  History, CheckCircle2, ChevronRight, HelpCircle, GitMerge,
  Activity, Bug, Server, Users, ChevronDown, ChevronUp, Plus, X
} from 'lucide-react';
import { initialSentryIssues, mockArgoCDStatus } from '../data/seedData';
import type { DeploymentStatus, IncidentSeverity, ProjectRole } from '../types/platform';

type ProjectTab = 'overview' | 'deployments' | 'monitoring' | 'errors' | 'infrastructure' | 'team';

const relTime = (ts: string) => {
  const d = Date.now() - new Date(ts).getTime();
  const m = Math.floor(d / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const sourceBadge = (source: string) => {
  const map: Record<string, string> = {
    grafana: 'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    datadog: 'bg-purple-500/10 text-purple-400 border border-purple-500/20',
    sentry:  'bg-violet-500/10 text-violet-400 border border-violet-500/20',
    vercel:  'bg-zinc-500/10 text-zinc-200 border border-zinc-500/20',
    netlify: 'bg-teal-500/10 text-teal-400 border border-teal-500/20',
  };
  return map[source.toLowerCase()] || 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20';
};

const sourceLabel = (source: string) => {
  const map: Record<string, string> = { grafana: 'GF', datadog: 'DD', sentry: 'SN', vercel: 'VC', netlify: 'NF' };
  return map[source.toLowerCase()] || source.slice(0, 2).toUpperCase();
};

const levelPill = (level: string) => {
  const map: Record<string, string> = {
    fatal:   'bg-red-500/15 text-red-400 border border-red-500/25',
    error:   'bg-orange-500/10 text-orange-400 border border-orange-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border border-amber-500/20',
    info:    'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20',
  };
  return map[level] || map.info;
};

const roleBadge = (role: ProjectRole) => {
  if (role === 'admin')     return 'bg-white text-black text-[9px] px-2 py-0.5 rounded font-mono font-bold';
  if (role === 'developer') return 'bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[9px] px-2 py-0.5 rounded font-mono';
  return 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 text-[9px] px-2 py-0.5 rounded font-mono';
};

const argoCDSyncBadge = (s: string) => {
  if (s === 'Synced')    return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  if (s === 'OutOfSync') return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
  return 'bg-red-500/10 text-red-400 border border-red-500/20';
};

export const ProjectDetails: React.FC = () => {
  const {
    activeProjectId, projects, deployments, incidents, navigateTo,
    monitoringAlerts, teamMembers, addTeamMember, removeTeamMember,
    updateTeamMemberRole, user, auditLogs, setAuditLogs
  } = usePlatform() as any;

  const [activeTab, setActiveTab] = useState<ProjectTab>('overview');
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [syncTriggered, setSyncTriggered] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<ProjectRole>('developer');

  const project = projects.find((p: any) => p.id === activeProjectId);

  if (!project) {
    return (
      <div className="text-center p-8 bg-white/[0.03] border border-white/[0.06] rounded-xl">
        <h3 className="text-sm font-semibold text-white mb-2">No active project selected</h3>
        <button onClick={() => navigateTo('projects')}
          className="bg-white text-black hover:bg-zinc-200 font-medium py-1.5 px-3 rounded text-xs">
          Select project
        </button>
      </div>
    );
  }

  const projectDeploys = deployments.filter((d: any) => d.projectId === project.id);
  const projectIncidents = incidents.filter((i: any) => i.projectId === project.id);
  const projectAlerts = monitoringAlerts.filter((a: any) => a.projectId === project.id);
  const projectSentryIssues = initialSentryIssues.filter(i => i.projectId === project.id);
  const projectTeam = teamMembers.filter((tm: any) => tm.projectId === project.id);

  const getStatusIndicator = (status: DeploymentStatus) => {
    switch (status) {
      case 'ready':       return <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span><span className="text-xs font-semibold text-zinc-200">Operational</span></div>;
      case 'failed':      return <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping"></span><span className="text-xs font-semibold text-red-400">Failed</span></div>;
      case 'building':    return <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-spin"></span><span className="text-xs font-semibold text-blue-400">Building</span></div>;
      case 'rolled_back': return <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span><span className="text-xs font-semibold text-purple-400">Recovered</span></div>;
      default:            return <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-zinc-500"></span><span className="text-xs font-semibold text-zinc-500">Suspended</span></div>;
    }
  };

  const getSeverityBadge = (severity: IncidentSeverity) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/10 text-red-400 border-red-500/20 font-bold';
      case 'high':     return 'bg-orange-500/10 text-orange-400 border-orange-500/25';
      case 'medium':   return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:         return 'text-zinc-500 bg-white/5 border-white/[0.06]';
    }
  };

  const getDeployStatusBadge = (status: DeploymentStatus) => {
    switch (status) {
      case 'ready':       return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'failed':      return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'building':    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'rolled_back': return 'bg-purple-500/10 text-purple-400 border-purple-500/25';
      default:            return 'text-zinc-500 bg-white/5 border-white/[0.06]';
    }
  };

  const tabs: { id: ProjectTab; label: string; icon: any }[] = [
    { id: 'overview',        label: 'Overview',        icon: Server },
    { id: 'deployments',     label: 'Deployments',     icon: History },
    { id: 'monitoring',      label: 'Monitoring',      icon: Activity },
    { id: 'errors',          label: 'Errors',          icon: Bug },
    { id: 'infrastructure',  label: 'Infrastructure',  icon: GitMerge },
    { id: 'team',            label: 'Team',            icon: Users },
  ];

  return (
    <div className="space-y-4">
      {/* Back */}
      <button onClick={() => navigateTo('projects')}
        className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors">
        <ArrowLeft size={14} />Back to projects catalog
      </button>

      {/* Title row */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
              project.provider === 'vercel' ? 'bg-black/40 text-zinc-200 border border-white/10' : 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
            }`}>{project.provider}</span>
            <span className="text-[10px] text-zinc-500 font-mono">{project.environment}</span>
          </div>
          <h2 className="text-xl font-semibold text-white tracking-tight">{project.name}</h2>
        </div>
        {getStatusIndicator(project.status)}
      </div>

      {/* 6-tab bar */}
      <div className="flex border-b border-white/[0.06]">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 pb-3 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-white text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 lg:col-span-2 space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">{project.description}</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white/[0.02] p-4 rounded-lg border border-white/[0.06] text-xs">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Source Repository</span>
                  <span className="font-mono text-zinc-300 flex items-center gap-1"><Github size={12} className="text-zinc-600" />{project.repoOwner}/{project.repoName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Production Branch</span>
                  <span className="font-mono text-zinc-400 bg-black/20 border border-white/5 px-1.5 py-0.5 rounded">{project.branch}</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Deployment URL</span>
                  {project.status === 'ready' || project.status === 'rolled_back' ? (
                    <a href={projectDeploys[0]?.url} target="_blank" rel="noreferrer" className="text-zinc-300 hover:underline flex items-center gap-1">
                      Visit App <ExternalLink size={10} />
                    </a>
                  ) : <span className="text-zinc-600 italic">Unavailable</span>}
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Webhook</span>
                  <span className="font-mono text-zinc-400 text-[10px]">Active</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 border-t border-white/[0.06] pt-4">
              <button onClick={() => navigateTo('rollback-recovery', { projectId: project.id })}
                className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5">
                <RefreshCw size={14} />Initiate Rollback Recovery
              </button>
              {project.status === 'failed' && (
                <button onClick={() => navigateTo('ai-assistant', { projectId: project.id, deploymentId: projectDeploys[0]?.id })}
                  className="bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-medium py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5">
                  <HelpCircle size={14} />Diagnose Build Failure
                </button>
              )}
            </div>
          </div>

          {/* Incidents panel */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Incident Alerts</h4>
            {projectIncidents.length === 0 ? (
              <div className="p-4 bg-white/[0.02] border border-white/[0.06] rounded-lg text-center">
                <CheckCircle2 size={24} className="text-emerald-500 mx-auto mb-2" />
                <p className="text-xs text-zinc-300 font-semibold">No active alerts</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[300px] overflow-y-auto">
                {projectIncidents.map((inc: any) => (
                  <div key={inc.id} onClick={() => navigateTo('incidents', { incidentId: inc.id })}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                      inc.status !== 'resolved' ? 'bg-red-500/5 border-red-500/20 hover:border-red-500/30' : 'bg-white/[0.02] border-white/[0.06]'
                    }`}>
                    <div className="flex justify-between items-start gap-2 mb-1">
                      <span className="font-semibold text-zinc-200">{inc.title}</span>
                      <span className={`px-1.5 py-0.5 border rounded text-[9px] font-mono capitalize ${getSeverityBadge(inc.severity)}`}>{inc.severity}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-zinc-500 mt-1.5">
                      <span className={inc.status !== 'resolved' ? 'text-red-400' : 'text-emerald-400'}>{inc.status.toUpperCase()}</span>
                      <span>{new Date(inc.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DEPLOYMENTS TAB ── */}
      {activeTab === 'deployments' && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider flex items-center gap-1.5">
              <History size={14} className="text-zinc-500" />Deployment History
            </h4>
            <button onClick={() => navigateTo('deployments')} className="text-[10px] text-zinc-400 hover:underline">Full timeline</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                  <th className="py-2.5">VERSION</th><th className="py-2.5">COMMIT MESSAGE</th><th className="py-2.5">BRANCH</th>
                  <th className="py-2.5">STATUS</th><th className="py-2.5">DURATION</th><th className="py-2.5">DATE</th>
                  <th className="py-2.5 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-zinc-300">
                {projectDeploys.slice(0, 8).map((deploy: any) => (
                  <tr key={deploy.id} className="hover:bg-white/[0.02] group">
                    <td className="py-3 font-mono text-[10px] font-bold text-zinc-300">{deploy.version}</td>
                    <td className="py-3 max-w-xs truncate pr-4">
                      <span className="font-semibold text-zinc-200 block truncate">{deploy.commitMessage}</span>
                      <span className="text-[10px] text-zinc-500 font-mono mt-0.5 block">SHA: {deploy.commitHash} by {deploy.author}</span>
                    </td>
                    <td className="py-3 font-mono text-[10px] text-zinc-500">{deploy.branch}</td>
                    <td className="py-3"><span className={`px-2 py-0.5 border rounded-full text-[9px] font-mono font-semibold capitalize ${getDeployStatusBadge(deploy.status)}`}>{deploy.status.replace('_', ' ')}</span></td>
                    <td className="py-3 font-mono text-zinc-500">{deploy.durationMs > 0 ? `${(deploy.durationMs/1000).toFixed(1)}s` : '--'}</td>
                    <td className="py-3 text-zinc-500">{new Date(deploy.createdAt).toLocaleDateString()}</td>
                    <td className="py-3 text-right">
                      <button onClick={() => navigateTo('deployment-details', { deploymentId: deploy.id })}
                        className="text-[11px] font-medium text-zinc-400 hover:text-zinc-200 flex items-center gap-0.5 justify-end ml-auto">
                        Logs <ChevronRight size={12} className="group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── MONITORING TAB ── */}
      {activeTab === 'monitoring' && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Active Alerts</h4>
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                projectAlerts.filter((a: any) => a.status === 'firing').length > 0
                  ? 'bg-red-500/10 text-red-400 border-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                {projectAlerts.filter((a: any) => a.status === 'firing').length} firing
              </span>
              <button onClick={() => navigateTo('monitoring')} className="text-[10px] text-zinc-400 hover:text-zinc-200 hover:underline">View all →</button>
            </div>
          </div>
          {projectAlerts.length === 0 ? (
            <div className="text-center py-8 text-zinc-600">
              <Activity size={28} className="mx-auto mb-2 text-zinc-700" />
              <p className="text-xs font-semibold text-zinc-400">No active alerts</p>
              <p className="text-[10px] mt-1">Connect Grafana, Datadog, or Sentry in Integrations.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {projectAlerts.map((alert: any) => (
                <div key={alert.id} onClick={() => navigateTo('monitoring')}
                  className="flex items-start gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg hover:bg-white/[0.03] cursor-pointer transition-all">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border shrink-0 ${sourceBadge(alert.source)}`}>
                    {sourceLabel(alert.source)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-[9px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded border ${
                        alert.severity === 'critical' ? 'bg-red-500/15 text-red-400 border-red-500/25' :
                        alert.severity === 'high'     ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                        'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      }`}>{alert.severity}</span>
                      <span className={`text-[9px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded border ${
                        alert.status === 'firing' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}>{alert.status}</span>
                    </div>
                    <p className="text-xs text-zinc-300 font-medium">{alert.title}</p>
                    {alert.value && <p className="text-[10px] text-zinc-500 font-mono mt-0.5">{alert.value}{alert.threshold ? ` · threshold ${alert.threshold}` : ''}</p>}
                  </div>
                  <span className="text-[9px] text-zinc-600 font-mono shrink-0">{relTime(alert.firedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ERRORS TAB ── */}
      {activeTab === 'errors' && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
              Unresolved Sentry Issues
              {projectSentryIssues.length > 0 && (
                <span className="ml-2 text-[10px] font-mono bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded">{projectSentryIssues.length}</span>
              )}
            </h4>
            <button onClick={() => navigateTo('ai-assistant', { projectId: project.id })}
              className="text-[10px] text-violet-400 hover:text-violet-300 border border-violet-500/20 hover:border-violet-500/40 px-2.5 py-1 rounded transition-all">
              Ask AI about all
            </button>
          </div>
          {projectSentryIssues.length === 0 ? (
            <div className="text-center py-8 text-zinc-600">
              <Bug size={28} className="mx-auto mb-2 text-zinc-700" />
              <p className="text-xs font-semibold text-zinc-400">No unresolved Sentry issues</p>
              <p className="text-[10px] mt-1">Install Sentry plugin in Integrations to track errors.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {projectSentryIssues.map(issue => {
                const isExpanded = expandedIssueId === issue.id;
                return (
                  <div key={issue.id} className="bg-white/[0.02] border border-white/[0.06] rounded-lg overflow-hidden">
                    <div className="flex items-center gap-3 p-3">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold font-mono border bg-violet-500/10 text-violet-400 border-violet-500/20 shrink-0">SN</span>
                      <span className={`text-[9px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded border shrink-0 ${levelPill(issue.level)}`}>{issue.level}</span>
                      <span className="flex-1 text-xs text-zinc-300 font-medium truncate">{issue.title}</span>
                      <span className="text-[10px] text-zinc-500 font-mono shrink-0">{issue.count}×</span>
                      <button onClick={() => navigateTo('ai-assistant', { projectId: project.id, deploymentId: issue.deploymentId })}
                        className="text-[10px] text-violet-400 hover:text-violet-300 shrink-0 px-2 py-0.5 border border-violet-500/20 rounded transition-all">
                        Ask AI
                      </button>
                      <button onClick={() => setExpandedIssueId(isExpanded ? null : issue.id)}
                        className="text-zinc-500 hover:text-zinc-300 shrink-0 transition-colors">
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-white/[0.06] p-3 space-y-3">
                        {issue.stackTrace && (
                          <pre className="bg-black/40 border border-white/[0.06] rounded p-3 font-mono text-[10px] text-zinc-400 overflow-x-auto whitespace-pre-wrap leading-relaxed">
                            {issue.stackTrace}
                          </pre>
                        )}
                        <div className="grid grid-cols-2 gap-3 text-[10px]">
                          <div className="flex justify-between"><span className="text-zinc-500">First seen</span><span className="text-zinc-300 font-mono">{new Date(issue.firstSeen).toLocaleDateString()}</span></div>
                          <div className="flex justify-between"><span className="text-zinc-500">Last seen</span><span className="text-zinc-300 font-mono">{new Date(issue.lastSeen).toLocaleDateString()}</span></div>
                          {issue.release && <div className="flex justify-between"><span className="text-zinc-500">Release</span><span className="text-zinc-300 font-mono">{issue.release}</span></div>}
                          {issue.environment && <div className="flex justify-between"><span className="text-zinc-500">Environment</span><span className="text-zinc-300 font-mono">{issue.environment}</span></div>}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── INFRASTRUCTURE TAB ── */}
      {activeTab === 'infrastructure' && (
        <div className="space-y-4">
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Infrastructure</h4>
              <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${argoCDSyncBadge(mockArgoCDStatus.syncStatus)}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  mockArgoCDStatus.syncStatus === 'Synced' ? 'bg-emerald-500 animate-ping' :
                  mockArgoCDStatus.syncStatus === 'OutOfSync' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
                }`}></span>
                {mockArgoCDStatus.syncStatus}
              </span>
            </div>
            <div className="space-y-0 divide-y divide-white/[0.06] mb-4">
              {[
                { label: 'Application', value: mockArgoCDStatus.appName },
                { label: 'Sync Status', value: <span className={`text-[9px] font-mono font-semibold uppercase px-2 py-0.5 rounded border ${argoCDSyncBadge(mockArgoCDStatus.syncStatus)}`}>{mockArgoCDStatus.syncStatus}</span> },
                { label: 'Health', value: mockArgoCDStatus.healthStatus },
                { label: 'Image Tag', value: <span className="font-mono text-[11px]">{mockArgoCDStatus.currentImageTag}</span> },
                { label: 'Last Synced', value: relTime(mockArgoCDStatus.lastSyncedAt) },
                { label: 'Namespace', value: <span className="font-mono text-[11px]">{mockArgoCDStatus.namespace}</span> },
                { label: 'Target Revision', value: mockArgoCDStatus.targetRevision },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center py-2.5 text-xs">
                  <span className="text-zinc-500">{row.label}</span>
                  <span className="text-zinc-200 text-right">{row.value}</span>
                </div>
              ))}
            </div>
            {syncTriggered && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] p-2.5 rounded-lg mb-3 flex items-center gap-2">
                <CheckCircle2 size={12} />Sync triggered. ArgoCD will apply changes within ~30s.
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setSyncTriggered(true);
                  setTimeout(() => setSyncTriggered(false), 5000);
                }}
                className="bg-white text-black hover:bg-zinc-200 font-medium py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5">
                <RefreshCw size={13} />Trigger Manual Sync
              </button>
              <button onClick={() => navigateTo('rollback-recovery', { projectId: project.id })}
                className="bg-zinc-900 text-zinc-300 border border-white/[0.06] hover:bg-zinc-800 font-medium py-2 px-4 rounded-lg text-xs transition-all">
                View Rollback History
              </button>
            </div>
          </div>
          <div className="bg-amber-500/5 border border-amber-500/20 text-amber-400 text-[10px] p-3 rounded-lg flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>ArgoCD live data requires Phase 2 backend. Currently showing mock state for demonstration purposes.</span>
          </div>
        </div>
      )}

      {/* ── TEAM TAB ── */}
      {activeTab === 'team' && (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
          <div className="flex justify-between items-center mb-4">
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">
              Team Members
              <span className="ml-2 text-[10px] font-mono bg-white/5 text-zinc-400 border border-white/[0.06] px-1.5 py-0.5 rounded">{projectTeam.length}</span>
            </h4>
            {user?.role === 'admin' && (
              <button onClick={() => setShowInviteModal(true)}
                className="bg-white text-black hover:bg-zinc-200 font-medium py-1.5 px-3 rounded text-xs flex items-center gap-1.5">
                <Plus size={12} />Invite Member
              </button>
            )}
          </div>

          {projectTeam.length === 0 ? (
            <div className="text-center py-8 text-zinc-600">
              <Users size={28} className="mx-auto mb-2 text-zinc-700" />
              <p className="text-xs font-semibold text-zinc-400">No team members</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] font-semibold text-zinc-600 uppercase tracking-wider">
                  <th className="pb-2.5 text-left">Member</th>
                  <th className="pb-2.5 text-left">Email</th>
                  <th className="pb-2.5 text-left">Role</th>
                  <th className="pb-2.5 text-left">Since</th>
                  <th className="pb-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {projectTeam.map((tm: any) => {
                  const isOwn = tm.userId === user?.id;
                  const initials = tm.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <tr key={tm.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-md bg-gradient-to-tr from-zinc-700 to-zinc-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                            {initials}
                          </div>
                          <span className="text-zinc-200 font-medium">{tm.name}</span>
                        </div>
                      </td>
                      <td className="py-3 text-zinc-500 font-mono text-[10px]">{tm.email}</td>
                      <td className="py-3">
                        {user?.role === 'admin' && !isOwn ? (
                          <select value={tm.role} onChange={e => updateTeamMemberRole(tm.id, e.target.value as ProjectRole)}
                            className="bg-black/30 border border-white/[0.06] text-zinc-300 text-[10px] rounded p-0.5 focus:outline-none">
                            <option value="viewer">viewer</option>
                            <option value="developer">developer</option>
                            <option value="admin">admin</option>
                          </select>
                        ) : (
                          <span className={roleBadge(tm.role)}>{tm.role}</span>
                        )}
                      </td>
                      <td className="py-3 text-zinc-500 font-mono text-[10px]">{new Date(tm.addedAt).toLocaleDateString()}</td>
                      <td className="py-3 text-right">
                        {user?.role === 'admin' && !isOwn && (
                          <button onClick={() => { if (window.confirm(`Remove ${tm.name} from the project?`)) removeTeamMember(tm.id); }}
                            className="text-zinc-600 hover:text-red-400 transition-colors">
                            <X size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Role footnote */}
          <div className="mt-4 pt-3 border-t border-white/[0.06] text-[10px] text-zinc-600 space-y-0.5">
            <p><span className="text-zinc-400 font-semibold">viewer</span> — read-only access to all pages</p>
            <p><span className="text-zinc-400 font-semibold">developer</span> — can comment and resolve incidents</p>
            <p><span className="text-zinc-400 font-semibold">admin</span> — full access including rollback, plugin config, and team management</p>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#050505] border border-white/[0.06] rounded-xl p-6 w-96 shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-semibold text-white">Invite Team Member</h3>
              <button onClick={() => { setShowInviteModal(false); setInviteEmail(''); setInviteRole('developer'); }}
                className="text-zinc-500 hover:text-zinc-300"><X size={16} /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-400 mb-1.5">Email Address</label>
                <input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder="developer@company.com"
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md p-2.5 font-mono" />
              </div>
              <div>
                <label className="block font-semibold text-zinc-400 mb-1.5">Role</label>
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value as ProjectRole)}
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-300 focus:outline-none rounded-md p-2.5">
                  <option value="viewer">viewer — read-only</option>
                  <option value="developer">developer — can resolve incidents</option>
                  <option value="admin">admin — full access</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-white/[0.06]">
              <button onClick={() => { setShowInviteModal(false); setInviteEmail(''); }}
                className="px-3 py-1.5 bg-zinc-900 border border-white/[0.06] text-zinc-300 rounded text-xs">Cancel</button>
              <button
                onClick={() => {
                  if (!inviteEmail.trim()) return;
                  addTeamMember({
                    userId: 'u_' + Math.random().toString(36).substr(2, 6),
                    name: inviteEmail.split('@')[0].charAt(0).toUpperCase() + inviteEmail.split('@')[0].slice(1),
                    email: inviteEmail,
                    role: inviteRole,
                    projectId: project.id,
                  });
                  setShowInviteModal(false);
                  setInviteEmail('');
                  setInviteRole('developer');
                }}
                className="px-3 py-1.5 bg-white text-black hover:bg-zinc-200 rounded text-xs font-medium">
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
