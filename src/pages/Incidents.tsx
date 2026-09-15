import React, { useState, useEffect, useRef } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { aiExplanations } from '../data/seedData';
import {
  Search, ArrowLeft, ChevronDown, CheckCircle, RefreshCw,
  Settings, Code, ExternalLink, ChevronRight, AlertTriangle,
  MessageSquare, Zap, Terminal, Send, Filter, Share2, Shield
} from 'lucide-react';
import { MentionInput } from '../components/MentionInput';
import { MentionText } from '../components/MentionText';
import { ShareDialog } from '../components/ShareDialog';
import { alertSourceColor, alertSourceLabel } from '../lib/alertUtils';
import type { Incident, IncidentSeverity, IncidentStatus } from '../types/platform';

// ─────────────────────────────────────────────────────────────────────
// Helper types
// ─────────────────────────────────────────────────────────────────────

interface RemediationStep {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  isResolveLink?: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// getRemediationSteps — Task 3
// ─────────────────────────────────────────────────────────────────────

function getRemediationSteps(deploymentId?: string): RemediationStep[] {
  const ai = deploymentId ? (aiExplanations as Record<string, { recommendations?: string[] }>)[deploymentId] : undefined;
  if (ai?.recommendations?.length) {
    const steps: RemediationStep[] = ai.recommendations.map((rec: string) => {
      const splitIdx = rec.search(/[.:]/);
      const title = splitIdx > 0 ? rec.slice(0, splitIdx) : rec.slice(0, 50);
      const description = splitIdx > 0 ? rec.slice(splitIdx + 1).trim() : '';
      let icon: React.ComponentType<{ size?: number; className?: string }> = ChevronRight;
      if (/rollback|restore|revert/i.test(rec)) icon = RefreshCw;
      else if (/variable|environment|config/i.test(rec)) icon = Settings;
      else if (/log|examine|inspect|check/i.test(rec)) icon = Search;
      else if (/fix|update|refactor|patch/i.test(rec)) icon = Code;
      else if (/navigate|dashboard|open/i.test(rec)) icon = ExternalLink;
      return { icon, title, description };
    });
    steps.push({ icon: CheckCircle, title: 'You can mark the incident as resolved', description: '', isResolveLink: true });
    return steps;
  }
  return [
    { icon: Search, title: 'Investigate the root cause', description: 'Review deployment logs and error messages to identify what triggered this incident.' },
    { icon: RefreshCw, title: 'Attempt recovery', description: 'Consider rolling back to the last known stable deployment version.' },
    { icon: CheckCircle, title: 'You can mark the incident as resolved', description: '', isResolveLink: true },
  ];
}

// ─────────────────────────────────────────────────────────────────────
// Time helpers — Task 4
// ─────────────────────────────────────────────────────────────────────

function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  if (hours < 24) return `about ${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function openedFor(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (hours < 1) return 'Less than 1 hour';
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`;
  return `${days} day${days !== 1 ? 's' : ''}`;
}

// ─────────────────────────────────────────────────────────────────────
// Badge helpers
// ─────────────────────────────────────────────────────────────────────

const severityBadge = (severity: IncidentSeverity) => {
  const map: Record<IncidentSeverity, string> = {
    critical: 'bg-red-500/20 text-red-400 border border-red-500/30 rounded-full',
    high:     'bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full',
    medium:   'bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full',
    low:      'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 rounded-full',
  };
  return map[severity] || map.low;
};

const statusBadge = (status: IncidentStatus) => {
  const map: Record<IncidentStatus, string> = {
    open:          'bg-red-500/10 text-red-400 border border-red-500/20 rounded-full',
    investigating: 'bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full',
    resolved:      'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full',
    ignored:       'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 rounded-full',
  };
  return map[status] || map.open;
};

const sourceBadge = alertSourceColor;
const sourceLabel = alertSourceLabel;

// ─────────────────────────────────────────────────────────────────────
// Tab types
// ─────────────────────────────────────────────────────────────────────

type ListTab = 'all' | 'open' | 'critical' | 'investigating' | 'resolved';
type DetailTab = 'overview' | 'locations' | 'feedback' | 'activity';
type ActivityFilter = 'all' | 'actions' | 'comments';

// ─────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────

export const Incidents: React.FC = () => {
  const {
    incidents, deployments, monitoringAlerts, navigateTo,
    addComment, resolveIncident, updateIncident, user,
    activeIncidentId, teamMembers, projects, activeProjectId,
  } = usePlatform();

  // Role-based enforcement — find the current user's role in the active project
  const userProjectRole = teamMembers.find(
    tm => tm.projectId === (activeProjectId || projects[0]?.id) && tm.userId === user?.id
  )?.role ?? 'admin';

  // Task 5a — State
  const [listTab, setListTab] = useState<ListTab>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [serviceFilter, setServiceFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(activeIncidentId || null);
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const [resolveOpen, setResolveOpen] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [ignoreOpen, setIgnoreOpen] = useState(false);
  const resolveRef = useRef<HTMLDivElement>(null);
  const ignoreRef = useRef<HTMLDivElement>(null);
  const [feedbackIsReal, setFeedbackIsReal] = useState<boolean | null>(null);
  const [feedbackComment, setFeedbackComment] = useState('');
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [commentText, setCommentText] = useState('');

  // Task 11d — Click-outside effect
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (resolveRef.current && !resolveRef.current.contains(e.target as Node)) setResolveOpen(false);
      if (ignoreRef.current && !ignoreRef.current.contains(e.target as Node)) setIgnoreOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Task 5b — Filter logic
  // Service scope comes from the project's microservice name (RBAC-scoped)
  const serviceNameFor = (inc: Incident): string | undefined =>
    inc.securityMetadata?.service ||
    projects.find(p => p.id === inc.projectId)?.serviceName;

  const serviceOptions = projects
    .filter(p => p.serviceName)
    .map(p => ({ id: p.serviceName as string, name: p.serviceName as string }))
    .filter((m, i, arr) => arr.findIndex(x => x.id === m.id) === i);

  const filteredIncidents = incidents.filter(inc => {
    const matchSearch = inc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inc.projectName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchTab =
      listTab === 'all'           ? true :
      listTab === 'open'          ? inc.status === 'open' :
      listTab === 'critical'      ? inc.severity === 'critical' :
      listTab === 'investigating' ? inc.status === 'investigating' :
      listTab === 'resolved'      ? inc.status === 'resolved' : true;
    const matchService = serviceFilter === 'all' || serviceNameFor(inc) === serviceFilter;
    return matchSearch && matchTab && matchService;
  });

  const selectedIncident = incidents.find(i => i.id === selectedId);
  const deployment = selectedIncident?.deploymentId
    ? deployments.find(d => d.id === selectedIncident.deploymentId)
    : undefined;
  const relatedAlerts = selectedIncident
    ? monitoringAlerts.filter(a => a.incidentId === selectedIncident.id)
    : [];
  const hasCritical = incidents.some(i => i.severity === 'critical');

  // ─────────────────────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────────────────────

  if (selectedId === null || !selectedIncident) {
    return (
      <div className="space-y-0">
        {/* Jira-style page header */}
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
              <AlertTriangle size={15} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">Incidents</h2>
              <p className="text-[10px] text-zinc-500 mt-0.5">{incidents.length} total · {incidents.filter(i => i.status !== 'resolved').length} open</p>
            </div>
          </div>
        </div>
        {/* Task 5c — Tab bar */}
        <div className="flex border-b border-white/[0.06] mb-0">
          {(['all', 'open', 'critical', 'investigating', 'resolved'] as ListTab[]).map(tab => (
            <button
              key={tab}
              onClick={() => setListTab(tab)}
              className={`capitalize px-4 pb-3 text-xs font-medium transition-colors flex items-center gap-1 ${
                listTab === tab
                  ? 'border-b-2 border-white text-white'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tab}
              {tab === 'critical' && hasCritical && listTab !== 'critical' && (
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-1" />
              )}
            </button>
          ))}
        </div>

        {/* Task 5d — Filter chips row */}
        <div className="flex items-center gap-2 py-3 flex-wrap">
          {serviceFilter !== 'all' && (
            <span className="bg-white/[0.03] border border-white/[0.06] text-zinc-400 text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
              Service: {serviceFilter}
              <button onClick={() => setServiceFilter('all')} className="text-zinc-600 hover:text-zinc-300 cursor-pointer ml-1">×</button>
            </span>
          )}
            {searchTerm && (
            <span className="bg-white/[0.03] border border-white/[0.06] text-zinc-400 text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
              Search: &quot;{searchTerm}&quot;
              <button onClick={() => setSearchTerm('')} className="text-zinc-600 hover:text-zinc-300 cursor-pointer ml-1">×</button>
            </span>
          )}
          {listTab === 'critical' && (
            <span className="bg-white/[0.03] border border-white/[0.06] text-zinc-400 text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1">
              Severity: Critical
              <button onClick={() => setListTab('all')} className="text-zinc-600 hover:text-zinc-300 cursor-pointer ml-1">×</button>
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[10px] text-zinc-600 font-mono">
              {filteredIncidents.length} results / {incidents.length} total
            </span>
            <button className="bg-white/[0.03] border border-white/[0.06] text-zinc-400 text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5">
              <Filter size={12} /> Columns
            </button>
          </div>
        </div>

        {/* Search + service filter */}
        <div className="flex gap-3 mb-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 text-zinc-600" size={13} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search incidents by title or project..."
              className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-lg text-xs pl-9 pr-4 py-2"
            />
          </div>
          <select
            value={serviceFilter}
            onChange={e => setServiceFilter(e.target.value)}
            title="Filter by microservice"
            className="bg-black/30 border border-white/[0.06] text-zinc-100 text-xs px-3 py-2 rounded-lg focus:border-white/20 focus:outline-none cursor-pointer"
          >
            <option value="all">All Services</option>
            {serviceOptions.map(o => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>

        {/* Task 5e — Incident table */}
        <div className="w-full bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-white/[0.06]">
                {['', 'TITLE', 'SEVERITY', 'SOURCE', 'INFO', 'TAGS', 'STATUS'].map(col => (
                  <th key={col} className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-xs text-zinc-600 italic">
                    No incidents found.
                  </td>
                </tr>
              ) : (
                filteredIncidents.map(inc => {
                  const tags: string[] = [];
                  if (inc.severity === 'critical' || inc.severity === 'high') tags.push('⚠ High Priority');
                  if (inc.source === 'security_triage') tags.push('Security');
                  if (inc.deploymentId) tags.push('Deploy Linked');
                  if (monitoringAlerts.some(a => a.incidentId === inc.id)) tags.push('Alert Linked');
                  const svcName = serviceNameFor(inc);

                  return (
                    <tr
                      key={inc.id}
                      onClick={() => { setSelectedId(inc.id); setActiveTab('overview'); setFeedbackSubmitted(false); }}
                      className="group hover:bg-white/[0.02] cursor-pointer border-b border-white/[0.06] last:border-0 transition-colors"
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3.5 w-8">
                        <input
                          type="checkbox"
                          onClick={e => e.stopPropagation()}
                          className="opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 accent-white cursor-pointer"
                        />
                      </td>
                      {/* Title */}
                      <td className="px-4 py-3.5 max-w-[220px]">
                        <div className="text-xs font-medium text-zinc-200 group-hover:text-white truncate">{inc.title}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {svcName && (
                            <span className="px-1.5 py-[1px] rounded text-[8px] font-bold font-mono bg-purple-500/20 text-purple-400 border border-purple-500/20 whitespace-nowrap">
                              {svcName}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-600 font-mono truncate">{inc.projectName}</span>
                        </div>
                      </td>
                      {/* Severity */}
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-0.5 text-[9px] font-mono font-semibold uppercase ${severityBadge(inc.severity)}`}>
                          {inc.severity}
                        </span>
                      </td>
                      {/* Source */}
                      <td className="px-4 py-3.5">
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono border ${sourceBadge(inc.provider)}`}>
                          {sourceLabel(inc.provider)}
                        </span>
                      </td>
                      {/* Info */}
                      <td className="px-4 py-3.5 max-w-[140px]">
                        <div className="text-[10px] text-zinc-400 truncate">{inc.projectName}</div>
                        {inc.assignedTo && (
                          <div className="text-[9px] text-zinc-600 font-mono mt-0.5 truncate">{inc.assignedTo}</div>
                        )}
                      </td>
                      {/* Tags */}
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {tags.map(tag => (
                            <span key={tag} className="text-[10px] font-medium bg-white/[0.03] border border-white/[0.08] text-zinc-400 px-2 py-0.5 rounded-full whitespace-nowrap">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <span className={`px-2.5 py-0.5 text-[9px] font-mono font-semibold uppercase ${statusBadge(inc.status)}`}>
                          {inc.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // DETAIL VIEW — Tasks 6–13
  // ─────────────────────────────────────────────────────────────────

  // Locations tab data
  const failedDeploys = deployments.filter(d => d.projectId === selectedIncident.projectId && d.status === 'failed').length;
  const occurrences = selectedIncident.timeline.length;
  const openIncidents = incidents.filter(i => i.projectId === selectedIncident.projectId && i.status !== 'resolved').length;
  const projectDeploys = deployments
    .filter(d => d.projectId === selectedIncident.projectId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Activity tab data — merged timeline + comments
  type ActivityItem =
    | { kind: 'timeline'; event: string; timestamp: string; type: 'alert' | 'comment' | 'action' | 'status_change' }
    | { kind: 'comment'; id: string; userName: string; userAvatar: string; content: string; timestamp: string };

  const allActivity: ActivityItem[] = [
    ...selectedIncident.timeline.map(t => ({ kind: 'timeline' as const, ...t, timestamp: t.timestamp })),
    ...selectedIncident.comments.map(c => ({
      kind: 'comment' as const,
      id: c.id,
      userName: c.userName,
      userAvatar: c.userAvatar,
      content: c.content,
      timestamp: c.createdAt,
    })),
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const filteredActivity = allActivity.filter(item => {
    if (activityFilter === 'all') return true;
    if (activityFilter === 'actions') return item.kind === 'timeline' && (item.type === 'alert' || item.type === 'status_change');
    if (activityFilter === 'comments') return item.kind === 'comment' || (item.kind === 'timeline' && item.type === 'comment');
    return true;
  });

  return (
    <div>
      {/* Task 6a — Back button */}
      <button
        onClick={() => { setSelectedId(null); setActiveTab('overview'); }}
        className="flex items-center gap-2 text-sm font-semibold text-zinc-300 hover:text-white transition-colors"
      >
        <ArrowLeft size={16} /> Back to Incidents
      </button>

      {/* Task 6b — Title row */}
      <div className="flex items-center gap-3 mb-4">
        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono border ${sourceBadge(selectedIncident.provider)}`}>
          {sourceLabel(selectedIncident.provider)}
        </span>
        <h2 className="text-xl font-semibold text-white tracking-tight">{selectedIncident.title}</h2>
        <button
          onClick={() => setShowShare(true)}
          className="ml-auto flex items-center gap-1.5 bg-dark-800 text-zinc-300 border border-white/[0.06] text-xs font-medium px-3 py-1.5 rounded-md transition-all hover:bg-dark-700"
        >
          <Share2 size={12} /> Share
        </button>
      </div>

      {showShare && (
        <ShareDialog
          entityType="incident"
          entityId={selectedIncident.id}
          entityName={selectedIncident.title}
          onClose={() => setShowShare(false)}
        />
      )}

      {/* Task 6c — 4-tab bar */}
      <div className="flex border-b border-white/[0.06] mb-4">
        {(['overview', 'locations', 'feedback', 'activity'] as DetailTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`capitalize px-4 pb-3 text-xs font-medium transition-colors ${
              activeTab === tab
                ? 'border-b-2 border-white text-white'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Task 6d — Split layout */}
      <div className="flex gap-6 items-start">
        {/* ── LEFT PANEL ── */}
        <div className="flex-1 min-w-0 space-y-4">

          {/* ── OVERVIEW TAB — Task 7 ── */}
          {activeTab === 'overview' && (
            <>
              {/* Task 7a — Incident Details KV card */}
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 relative overflow-hidden">
                <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider mb-4">Incident Details</h4>
                <div className="space-y-0 divide-y divide-white/[0.06]">
                  {[
                    { label: 'Project', value: selectedIncident.projectName },
                    {
                      label: 'Provider',
                      value: (
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold border ${sourceBadge(selectedIncident.provider)}`}>
                          {selectedIncident.provider.toUpperCase()}
                        </span>
                      ),
                    },
                    {
                      label: 'Status',
                      value: (
                        <span className={`px-2.5 py-0.5 text-[9px] font-mono font-semibold uppercase ${statusBadge(selectedIncident.status)}`}>
                          {selectedIncident.status}
                        </span>
                      ),
                    },
                    {
                      label: 'Severity',
                      value: (
                        <span className={`px-2.5 py-0.5 text-[9px] font-mono font-semibold uppercase ${severityBadge(selectedIncident.severity)}`}>
                          {selectedIncident.severity}
                        </span>
                      ),
                    },
                    { label: 'Deployment ID', value: selectedIncident.deploymentId || '—' },
                    { label: 'Commit Hash', value: deployment?.commitHash || '—' },
                    { label: 'Commit Message', value: deployment?.commitMessage || '—' },
                    { label: 'Branch', value: deployment?.branch || '—' },
                    { label: 'Error', value: deployment?.errorMessage, className: 'text-red-400' },
                    { label: 'Suggested Action', value: selectedIncident.suggestedAction || '—' },
                    { label: 'Created', value: new Date(selectedIncident.createdAt).toLocaleString() },
                    {
                      label: 'Resolved',
                      value: selectedIncident.resolvedAt
                        ? new Date(selectedIncident.resolvedAt).toLocaleString()
                        : 'Not yet',
                    },
                  ]
                    .filter(r => r.value)
                    .map(row => (
                      <div key={row.label} className="flex justify-between py-2.5 text-xs">
                        <span className="text-zinc-500 shrink-0 mr-4">{row.label}</span>
                        <span className={`text-right font-mono text-[11px] ${(row as { className?: string }).className || 'text-zinc-300'}`}>
                          {row.value}
                        </span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Security Context — shown only for security triage incidents */}
              {selectedIncident.securityMetadata && Object.keys(selectedIncident.securityMetadata).length > 0 && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4 relative overflow-hidden">
                  <div className="flex items-center gap-2 mb-1">
                    <Shield size={13} className="text-purple-400" />
                    <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Security Context</h4>
                  </div>

                  <div className="space-y-0 divide-y divide-white/[0.06]">
                    {[
                      selectedIncident.securityMetadata.service && { label: 'Service', value: selectedIncident.securityMetadata.service },
                      selectedIncident.securityMetadata.vulnerability_type && {
                        label: 'Vulnerability Type',
                        value: (
                          <span className="capitalize">{selectedIncident.securityMetadata.vulnerability_type.replace(/_/g, ' ')}</span>
                        ),
                      },
                      selectedIncident.securityMetadata.target && { label: 'Target', value: selectedIncident.securityMetadata.target },
                      selectedIncident.securityMetadata.cve_id && { label: 'CVE', value: selectedIncident.securityMetadata.cve_id },
                      selectedIncident.securityMetadata.package && {
                        label: 'Package',
                        value: `${selectedIncident.securityMetadata.package}${selectedIncident.securityMetadata.fixed_version ? ` → ${selectedIncident.securityMetadata.fixed_version}` : ''}`,
                      },
                      selectedIncident.securityMetadata.priority && { label: 'Priority', value: selectedIncident.securityMetadata.priority },
                      selectedIncident.securityMetadata.assigned_team && { label: 'Assigned Team', value: selectedIncident.securityMetadata.assigned_team },
                      selectedIncident.securityMetadata.story_points != null && { label: 'Story Points', value: String(selectedIncident.securityMetadata.story_points) },
                      selectedIncident.securityMetadata.ai_confidence != null && {
                        label: 'AI Confidence',
                        value: (
                          <span className={selectedIncident.securityMetadata.ai_confidence! >= 90 ? 'text-emerald-400' : selectedIncident.securityMetadata.ai_confidence! >= 75 ? 'text-amber-400' : 'text-zinc-400'}>
                            {selectedIncident.securityMetadata.ai_confidence}%
                          </span>
                        ),
                      },
                    ].filter((row): row is { label: string; value: React.ReactNode } => !!row).map(row => (
                      <div key={row.label} className="flex justify-between py-2.5 text-xs">
                        <span className="text-zinc-500 shrink-0 mr-4">{row.label}</span>
                        <span className="text-right font-mono text-[11px] text-zinc-300 break-all">{row.value}</span>
                      </div>
                    ))}
                  </div>

                  {selectedIncident.securityMetadata.github_issue_url && (
                    <a
                      href={selectedIncident.securityMetadata.github_issue_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-blue-500/20 transition-all"
                    >
                      <ExternalLink size={12} /> View GitHub Issue
                    </a>
                  )}

                  {selectedIncident.securityMetadata.remediation_steps && selectedIncident.securityMetadata.remediation_steps.length > 0 && (
                    <div>
                      <h5 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Remediation Steps</h5>
                      <ol className="list-decimal list-inside space-y-1 text-[11px] text-zinc-300">
                        {selectedIncident.securityMetadata.remediation_steps.map((step, i) => (
                          <li key={i}>{step}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {selectedIncident.securityMetadata.testing_steps && selectedIncident.securityMetadata.testing_steps.length > 0 && (
                    <div>
                      <h5 className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Testing Steps</h5>
                      <ul className="space-y-1 text-[11px] text-zinc-300">
                        {selectedIncident.securityMetadata.testing_steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-1.5">
                            <span className="text-zinc-600 mt-[1px]">☐</span>
                            {step}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {selectedIncident.securityMetadata.scan_run_id && selectedIncident.securityMetadata.repository && (
                    <div className="pt-1 text-[10px] text-zinc-500 font-mono truncate">
                      Scan run {selectedIncident.securityMetadata.scan_run_id}
                      {selectedIncident.securityMetadata.branch && ` · ${selectedIncident.securityMetadata.branch}`}
                      {selectedIncident.securityMetadata.commit_sha && ` · ${selectedIncident.securityMetadata.commit_sha.slice(0, 7)}`}
                    </div>
                  )}
                </div>
              )}

              {/* Task 7b — Deployment logs terminal */}
              {deployment?.logs && (
                <div className="bg-black/40 border border-white/[0.06] rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2 bg-white/[0.02]">
                    <Terminal size={12} className="text-zinc-500" />
                    <span className="text-[10px] font-mono text-zinc-400">Build Logs</span>
                    <span className="ml-auto text-[9px] font-mono bg-white/[0.03] border border-white/[0.06] text-zinc-500 px-2 py-0.5 rounded">
                      {deployment?.version}
                    </span>
                  </div>
                  <div className="p-4 max-h-64 overflow-y-auto font-mono text-[11px] space-y-0.5">
                    {deployment?.logs?.map((log, i) => (
                      <div key={i} className="flex gap-3">
                        <span className="text-zinc-700 select-none w-5 text-right shrink-0">{i + 1}</span>
                        <span className={
                          log.includes('Error') || log.includes('error') || log.includes('!!!')
                            ? 'text-red-400'
                            : log.includes('✓') || log.includes('success')
                            ? 'text-emerald-400'
                            : 'text-zinc-500'
                        }>{log}</span>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-3 border-t border-white/[0.06] flex gap-2">
                    <button
                      onClick={() => navigateTo('deployment-details', { deploymentId: selectedIncident.deploymentId })}
                      className="text-xs text-zinc-400 hover:text-white border border-white/[0.06] hover:border-white/20 px-3 py-1.5 rounded transition-all"
                    >
                      Inspect Full Logs
                    </button>
                    <button
                      onClick={() => navigateTo('rollback-recovery', { projectId: selectedIncident.projectId })}
                      className="text-xs text-zinc-400 hover:text-white border border-white/[0.06] hover:border-white/20 px-3 py-1.5 rounded transition-all"
                    >
                      Initiate Rollback
                    </button>
                  </div>
                </div>
              )}

              {/* Task 7c — Related Alerts */}
              {relatedAlerts.length > 0 && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 relative overflow-hidden">
                  <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider mb-3">Related Alerts</h4>
                  <div className="space-y-2">
                    {relatedAlerts.map(alert => (
                      <div
                        key={alert.id}
                        onClick={() => navigateTo('monitoring')}
                        className="flex items-start gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg cursor-pointer hover:bg-white/[0.03] transition-all"
                      >
                        <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono border shrink-0 ${sourceBadge(alert.source)}`}>
                          {sourceLabel(alert.source)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-zinc-300 font-medium">{alert.title}</p>
                          {alert.value && (
                            <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                              {alert.value}{alert.threshold ? ` · threshold ${alert.threshold}` : ''}
                            </p>
                          )}
                        </div>
                        <span className="text-[9px] text-zinc-600 font-mono shrink-0">
                          {new Date(alert.firedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── LOCATIONS TAB — Task 8 ── */}
          {activeTab === 'locations' && (
            <div>
              <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider mb-3">Impacted Perimeter</h4>
              {/* Task 8a — Stats grid */}
              <div className="grid grid-cols-3 gap-3 mb-6">
                {[
                  { label: 'Failed Deployments', value: failedDeploys, color: 'text-red-400' },
                  { label: 'Occurrences', value: occurrences, color: 'text-zinc-200' },
                  { label: 'Open Incidents', value: openIncidents, color: 'text-amber-400' },
                ].map(stat => (
                  <div key={stat.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 relative overflow-hidden">
                    <div className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.value}</div>
                    <div className="text-[10px] text-zinc-500 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Task 8b — Related Deployments table */}
              <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider mb-3">Related Deployments</h4>
              {projectDeploys.length === 0 ? (
                <p className="text-xs text-zinc-600 italic">No deployments found for this project.</p>
              ) : (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl relative overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        {['DATE', 'AUTHOR', 'COMMIT', 'STAGE FAILED', 'STATUS'].map(col => (
                          <th key={col} className="px-4 py-3 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {projectDeploys.slice(0, 8).map(dep => {
                        const failedStage = dep.stages?.find(s => s.status === 'failed')?.name || '—';
                        return (
                          <tr
                            key={dep.id}
                            onClick={() => navigateTo('deployment-details', { deploymentId: dep.id })}
                            className="hover:bg-white/[0.02] cursor-pointer transition-colors"
                          >
                            <td className="px-4 py-3.5">
                              <div className="text-zinc-300">{new Date(dep.createdAt).toLocaleDateString()}</div>
                              <div className="text-[10px] text-zinc-600 font-mono">
                                {new Date(dep.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </td>
                            <td className="px-4 py-3.5 text-zinc-400">{dep.author}</td>
                            <td className="px-4 py-3.5 font-mono text-[10px] text-zinc-400">{dep.commitHash}</td>
                            <td className="px-4 py-3.5 font-mono text-[10px] text-zinc-500">{failedStage}</td>
                            <td className="px-4 py-3.5">
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-semibold uppercase border ${
                                dep.status === 'ready'       ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                                dep.status === 'failed'      ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                dep.status === 'building'    ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                                dep.status === 'rolled_back' ? 'bg-violet-500/20 text-violet-400 border-violet-500/30' :
                                'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                              }`}>
                                {dep.status.replace('_', ' ')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── FEEDBACK TAB — Task 9 ── */}
          {activeTab === 'feedback' && (
            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-5 relative overflow-hidden">
              <div>
                <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider mb-1">Feedback</h4>
                <p className="text-xs text-zinc-500">Help improve incident detection accuracy by sharing your assessment.</p>
              </div>
              {feedbackSubmitted && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3 rounded-lg flex items-center gap-2">
                  <CheckCircle size={14} /> Feedback submitted successfully.
                </div>
              )}
              {/* Task 9a — Is this real toggle */}
              <div>
                <p className="text-xs font-semibold text-zinc-200 mb-2">Is this a real incident?</p>
                <div className="flex gap-2">
                  {[
                    { val: true, label: "Yes, it's real" },
                    { val: false, label: "It's a false positive" },
                  ].map(opt => (
                    <button
                      key={String(opt.val)}
                      onClick={() => setFeedbackIsReal(opt.val)}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                        feedbackIsReal === opt.val
                          ? 'bg-white text-black'
                          : 'bg-white/[0.03] text-zinc-400 border border-white/[0.06] hover:bg-white/5'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Task 9b — Comment + submit */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Additional comment</label>
                <MentionInput
                  value={feedbackComment}
                  onChange={setFeedbackComment}
                  rows={4}
                  placeholder="Write your comment (use @ to mention someone or a team)"
                  fallbackUsers={teamMembers.map(m => ({ name: m.name, email: m.email, avatarUrl: m.avatarUrl }))}
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-lg p-3 text-xs resize-none"
                />
              </div>
              <button
                onClick={() => {
                  if (feedbackComment.trim()) addComment(selectedIncident.id, feedbackComment);
                  updateIncident(selectedIncident.id, {
                    feedbackIsReal: feedbackIsReal ?? undefined,
                    feedbackComment,
                  });
                  setFeedbackSubmitted(true);
                  setFeedbackComment('');
                }}
                className="bg-white text-black hover:bg-zinc-200 font-medium text-xs px-4 py-2 rounded-lg transition-all"
              >
                Submit
              </button>
            </div>
          )}

          {/* ── ACTIVITY TAB — Task 10 ── */}
          {activeTab === 'activity' && (
            <div className="space-y-4">
              {/* Task 10a — Filter buttons */}
              <div className="flex gap-2">
                {(['all', 'actions', 'comments'] as ActivityFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setActivityFilter(f)}
                    className={`capitalize text-xs px-3 py-1.5 rounded border transition-all ${
                      activityFilter === f
                        ? 'bg-white/5 text-zinc-200 border-white/[0.06]'
                        : 'text-zinc-500 border-transparent hover:text-zinc-300'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {/* Task 10b — Comment input */}
              {selectedIncident.status !== 'resolved' && (
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-3 relative overflow-hidden">
                  <MentionInput
                    value={commentText}
                    onChange={setCommentText}
                    rows={3}
                    placeholder="Write a comment (use @ to mention someone or a team)"
                    fallbackUsers={teamMembers.map(m => ({ name: m.name, email: m.email, avatarUrl: m.avatarUrl }))}
                    className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-lg p-3 text-xs resize-none"
                  />
                  <button
                    onClick={() => {
                      if (commentText.trim()) {
                        addComment(selectedIncident.id, commentText);
                        setCommentText('');
                      }
                    }}
                    className="bg-white text-black hover:bg-zinc-200 font-medium text-xs px-4 py-2 rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <Send size={12} /> Submit
                  </button>
                </div>
              )}

              {/* Task 10c — Timeline feed */}
              <div className="space-y-0">
                {filteredActivity.map((item, idx) => {
                  const isLast = idx === filteredActivity.length - 1;
                  const timestamp = item.timestamp;

                  if (item.kind === 'comment') {
                    return (
                      <div key={item.id} className="relative flex gap-3 pb-4">
                        {!isLast && <div className="absolute left-3 top-6 bottom-0 w-px bg-white/[0.06]" />}
                        <img
                          src={item.userAvatar}
                          alt=""
                          className="w-6 h-6 rounded-full border border-white/[0.06] shrink-0 z-10"
                        />
                        <div className="flex-1 bg-white/[0.02] border border-white/[0.06] rounded-lg p-3 text-xs">
                          <div className="flex justify-between mb-1">
                            <span className="font-semibold text-zinc-200">{item.userName}</span>
                            <span className="text-[10px] text-zinc-600 font-mono">{relativeTime(timestamp)}</span>
                          </div>
                          <p className="text-zinc-400 leading-relaxed">
                            <MentionText content={item.content} />
                          </p>
                        </div>
                      </div>
                    );
                  }

                  // timeline event
                  const iconMap = {
                    alert:         { Icon: AlertTriangle, color: 'text-red-400' },
                    comment:       { Icon: MessageSquare, color: 'text-zinc-400' },
                    status_change: { Icon: CheckCircle,   color: 'text-emerald-400' },
                    action:        { Icon: Zap,           color: 'text-blue-400' },
                  };
                  const { Icon, color } = iconMap[item.type] || iconMap.action;

                  return (
                    <div key={idx} className="relative flex gap-3 pb-4 items-start">
                      {!isLast && <div className="absolute left-3 top-6 bottom-0 w-px bg-white/[0.06]" />}
                      <div className="w-6 h-6 rounded-full border border-white/[0.08] bg-white/[0.03] flex items-center justify-center shrink-0 z-10">
                        <Icon size={10} className={color} />
                      </div>
                      <div className="flex-1 pt-0.5">
                        <span className="text-xs text-zinc-400">{item.event}</span>
                        <span className="ml-2 text-[10px] text-zinc-600 font-mono">{relativeTime(timestamp)}</span>
                      </div>
                    </div>
                  );
                })}
                {filteredActivity.length === 0 && (
                  <p className="text-xs text-zinc-600 italic">No activity to show.</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT SIDEBAR — Tasks 11–13 ── */}
        <div className="w-80 shrink-0 sticky top-0 space-y-4">
          {/* Task 11 — Details card */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider mb-4">Details</h4>

            {/* Task 11a — Status badge */}
            <div className="mb-4">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase font-mono border ${statusBadge(selectedIncident.status)}`}>
                {selectedIncident.status}
              </span>
              {userProjectRole === 'viewer' && (
                <p className="text-[10px] text-zinc-500 mt-2 flex items-center gap-1">
                  <span className="text-amber-400 font-mono">viewer</span> — read-only access
                </p>
              )}
            </div>

            {/* Task 11b & 11c — Resolve + Ignore dropdowns (hidden for viewers) */}
            {selectedIncident.status !== 'resolved' && userProjectRole !== 'viewer' && (
              <div className="flex gap-2 mb-4">
                {/* Resolve dropdown */}
                <div className="relative" ref={resolveRef}>
                  <button
                    onClick={() => { setResolveOpen(!resolveOpen); setIgnoreOpen(false); }}
                    className="flex items-center gap-1.5 bg-white text-black hover:bg-zinc-200 text-xs font-medium px-3 py-1.5 rounded-md transition-all"
                  >
                    Resolve <ChevronDown size={12} />
                  </button>
                  {resolveOpen && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-dark-900 glass border border-white/[0.06] rounded-lg shadow-xl z-30">
                      {[
                        'I confirmed and fixed the issue',
                        'I confirmed and this is not fixable now',
                        'Rolling back resolves this',
                      ].map(opt => (
                        <div
                          key={opt}
                          onClick={() => {
                            resolveIncident(selectedIncident.id);
                            setResolveOpen(false);
                            setSelectedId(null);
                          }}
                          className="px-4 py-2.5 text-xs text-zinc-300 hover:bg-white/[0.03] hover:text-white cursor-pointer transition-colors"
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Ignore dropdown */}
                <div className="relative" ref={ignoreRef}>
                  <button
                    onClick={() => { setIgnoreOpen(!ignoreOpen); setResolveOpen(false); }}
                    className="flex items-center gap-1.5 bg-dark-800 text-zinc-300 border border-white/[0.06] text-xs font-medium px-3 py-1.5 rounded-md transition-all hover:bg-dark-700"
                  >
                    Ignore <ChevronDown size={12} />
                  </button>
                  {ignoreOpen && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-dark-900 glass border border-white/[0.06] rounded-lg shadow-xl z-30">
                      {[
                        'This is a test deployment',
                        'This is a known flaky issue',
                        'This is not a real incident (false positive)',
                        'This deployment is deprecated',
                      ].map(opt => (
                        <div
                          key={opt}
                          onClick={() => {
                            updateIncident(selectedIncident.id, { ignoredReason: opt, status: 'resolved' });
                            setIgnoreOpen(false);
                            setSelectedId(null);
                          }}
                          className="px-4 py-2.5 text-xs text-zinc-300 hover:bg-white/[0.03] hover:text-white cursor-pointer transition-colors"
                        >
                          {opt}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Task 12 — Details KV list */}
            <div className="space-y-0 divide-y divide-white/[0.06]">
              {[
                { label: 'Assignee', value: selectedIncident.assignedTo || 'Unassigned' },
                {
                  label: 'Occurred',
                  value: new Date(selectedIncident.createdAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  }),
                },
                {
                  label: 'Detected',
                  value: new Date(selectedIncident.createdAt).toLocaleDateString('en-US', {
                    month: 'short', day: 'numeric', year: 'numeric',
                  }),
                },
                { label: 'Opened for', value: openedFor(selectedIncident.createdAt) },
                {
                  label: 'Severity',
                  value: (
                    <span className={`px-2.5 py-0.5 text-[9px] font-mono font-semibold uppercase ${severityBadge(selectedIncident.severity)}`}>
                      {selectedIncident.severity}
                    </span>
                  ),
                },
                {
                  label: 'Provider',
                  value: (
                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono font-bold border ${sourceBadge(selectedIncident.provider)}`}>
                      {selectedIncident.provider.toUpperCase()}
                    </span>
                  ),
                },
                { label: 'Developer', value: selectedIncident.assignedTo || '—' },
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center py-2.5 text-xs">
                  <span className="text-zinc-500">{row.label}</span>
                  <span className="text-zinc-200 text-right font-mono text-[11px]">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Task 13 — How to remediate */}
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
            <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider mb-4">How to remediate</h4>
            <div className="space-y-0 divide-y divide-white/[0.06]">
              {getRemediationSteps(selectedIncident.deploymentId).map((step, idx) => {
                const Icon = step.icon;
                return (
                  <div key={idx} className="flex gap-3 items-start py-3">
                    <div className="w-6 h-6 rounded-full border border-white/[0.08] bg-white/[0.03] flex items-center justify-center shrink-0 mt-0.5">
                      <Icon size={10} className="text-zinc-400" />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      {step.isResolveLink ? (
                        <span
                          onClick={() => { resolveIncident(selectedIncident.id); setSelectedId(null); }}
                          className="text-xs font-semibold text-blue-400 hover:underline cursor-pointer"
                        >
                          {step.title}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-zinc-200">{step.title}</span>
                      )}
                      {step.description && (
                        <span className="text-[11px] text-zinc-500 leading-relaxed">{step.description}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
