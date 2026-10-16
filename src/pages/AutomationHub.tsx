import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { isApiAvailable, api } from '../services/api';
import { useDragReorder, timeAgo, nextCronRun } from '../hooks/useDragReorder';
import type { AutomationRule, ScheduledTask } from '../types/automation';
import {
  Zap, CalendarClock, Plus, Search, X, Play, Pause, Trash2, Copy, MoreHorizontal,
  ChevronLeft, AlertTriangle, CheckCircle, Loader, Clock3, Mail, HeartPulse,
  RefreshCw, FileBarChart, ServerCog, Bell, Globe, MessageSquare, History, Tag,
  SlidersHorizontal, ListPlus, GripVertical, ShieldCheck, GitBranch
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────────────────────
   Domain metadata
───────────────────────────────────────────────────────────────────────────── */

const TRIGGER_DEFS: { type: string; label: string; desc: string; icon: 'deploy' | 'incident' | 'alert' }[] = [
  { type: 'deployment.status_change', label: 'Deployment status change', desc: 'Fires when a deployment transitions between states', icon: 'deploy' },
  { type: 'incident.created', label: 'Incident created', desc: 'Fires when a new incident is opened', icon: 'incident' },
  { type: 'alert.fired', label: 'Alert fired', desc: 'Fires when a monitoring alert triggers', icon: 'alert' },
];

const ACTION_META: Record<string, { label: string; icon: React.ReactNode }> = {
  notify: { label: 'Send notification', icon: <Bell size={12} /> },
  email: { label: 'Send email', icon: <Mail size={12} /> },
  webhook: { label: 'Call webhook', icon: <Globe size={12} /> },
  comment: { label: 'Post comment', icon: <MessageSquare size={12} /> },
  resolve_incident: { label: 'Resolve incident', icon: <CheckCircle size={12} /> },
  update_status: { label: 'Update status', icon: <RefreshCw size={12} /> },
};

const CONDITION_FIELDS = ['status', 'severity', 'project_id', 'branch', 'environment'];
const CONDITION_OPS = ['eq', 'ne', 'contains', 'in', 'gt', 'lt', 'exists'];
const ACTION_TYPES = Object.keys(ACTION_META);
const TAGS = ['on-call', 'production', 'security', 'pager-duty'];

const TASK_META: Record<string, { label: string; icon: React.ReactNode; glyph: string }> = {
  email_digest: { label: 'Email digest', icon: <Mail size={13} />, glyph: 'text-violet-400 bg-violet-500/10 border-violet-500/20' },
  health_check: { label: 'Health check', icon: <HeartPulse size={13} />, glyph: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  alert_sync: { label: 'Alert sync', icon: <RefreshCw size={13} />, glyph: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  report: { label: 'Report', icon: <FileBarChart size={13} />, glyph: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  repo_poll: { label: 'Repo auto-build', icon: <GitBranch size={13} />, glyph: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
};

const TASK_TYPE_DESC: Record<string, string> = {
  email_digest: 'Daily/weekly summary emails to the team',
  health_check: 'Probe service endpoints and record uptime',
  alert_sync: 'Pull fresh alerts from monitoring providers',
  report: 'Generate a deployment or incident report',
  repo_poll: 'Dispatch a pipeline run on every new commit to the linked branch',
};

const PRESET_CRONS = [
  { label: 'Every 15m', value: '*/15 * * * *', desc: 'Quarter-hour' },
  { label: 'Hourly', value: '0 * * * *', desc: 'On the hour' },
  { label: 'Daily 9am', value: '0 9 * * *', desc: 'Once a day' },
  { label: 'Midnight', value: '0 0 * * *', desc: 'Daily rollover' },
  { label: 'Weekly Mon', value: '0 9 * * 1', desc: 'Every Monday' },
];

/* ─────────────────────────────────────────────────────────────────────────────
   Small presentational pieces
───────────────────────────────────────────────────────────────────────────── */

function triggerDef(type: string) {
  return TRIGGER_DEFS.find(t => t.type === type) || TRIGGER_DEFS[0];
}

function ruleGlyph(type: string): string {
  const def = triggerDef(type);
  if (def.icon === 'incident') return 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  if (def.icon === 'alert') return 'text-amber-400 bg-amber-500/10 border-amber-500/20';
  return 'text-sky-400 bg-sky-500/10 border-sky-500/20';
}

function RuleIcon({ type, size = 14 }: { type: string; size?: number }) {
  const def = triggerDef(type);
  const Icon = def.icon === 'incident' ? AlertTriangle : def.icon === 'alert' ? RefreshCw : Zap;
  return <Icon size={size} className={ruleGlyph(type).split(' ')[0]} />;
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold font-mono text-zinc-400 bg-white/5 border border-white/[0.08] px-2 py-0.5 rounded-full">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" /> Paused
    </span>
  );
}

function ExecBadge({ status }: { status: string }) {
  if (status === 'success')
    return <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full"><CheckCircle size={10} /> Success</span>;
  if (status === 'failed')
    return <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full"><X size={10} /> Failed</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full"><Clock3 size={10} /> {status}</span>;
}

function StateBanner({ kind, text, onDismiss }: { kind: 'success' | 'error'; text: string; onDismiss: () => void }) {
  const isErr = kind === 'error';
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs ${isErr ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`} role="status">
      {isErr ? <AlertTriangle size={14} className="mt-0.5 shrink-0" /> : <CheckCircle size={14} className="mt-0.5 shrink-0" />}
      <span className="flex-1 leading-relaxed">{text}</span>
      <button onClick={onDismiss} aria-label="Dismiss message" className="opacity-60 hover:opacity-100 transition-opacity">
        <X size={13} />
      </button>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2" aria-hidden="true">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 animate-pulse">
          <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-3 w-1/3 rounded bg-white/[0.06]" />
            <div className="h-2.5 w-2/3 rounded bg-white/[0.04]" />
          </div>
          <div className="h-5 w-16 rounded-full bg-white/[0.04]" />
        </div>
      ))}
    </div>
  );
}

function MenuButton({ items }: { items: Array<{ label: string; icon: React.ReactNode; danger?: boolean; onClick: () => void }> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-44 rounded-lg border border-white/10 bg-[#0d0d0d] shadow-2xl py-1">
          {items.map(item => (
            <button
              key={item.label}
              role="menuitem"
              onClick={() => { setOpen(false); item.onClick(); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${item.danger ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-300 hover:bg-white/[0.05] hover:text-white'}`}
            >
              {item.icon} {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({
  open, title, message, confirmLabel = 'Delete', onCancel, onConfirm,
}: {
  open: boolean; title: string; message: string; confirmLabel?: string; onCancel: () => void; onConfirm: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      role="dialog" aria-modal="true" aria-label={title}
      onClick={onCancel}
    >
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-dark-900 glass shadow-2xl p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <AlertTriangle size={15} className={confirmLabel === 'Delete' ? 'text-amber-400' : 'text-zinc-400'} /> {title}
        </h3>
        <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{message}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            autoFocus
            onClick={onCancel}
            className="bg-dark-800 text-zinc-300 border border-white/[0.06] hover:bg-dark-700 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Forms
───────────────────────────────────────────────────────────────────────────── */

interface RuleCondition { field: string; op: string; value: string }
interface RuleAction { type: string; title?: string; message?: string; subject?: string; recipient?: string; url?: string; content?: string; status?: string }
interface RuleForm {
  name: string; description: string; trigger_type: string; project_id: string;
  enabled: boolean; tags: string[]; conditions: RuleCondition[]; actions: RuleAction[];
}

const emptyRuleForm = (): RuleForm => ({
  name: '', description: '', trigger_type: 'deployment.status_change', project_id: '',
  enabled: true, tags: [],
  conditions: [{ field: 'status', op: 'eq', value: 'failed' }],
  actions: [{ type: 'notify', title: 'Deployment failed', message: 'A deployment just failed.' }],
});

interface TaskForm {
  name: string; description: string; cron_expression: string; task_type: string;
  enabled: boolean; task_config: Record<string, unknown>; project_id: string;
}

const emptyTaskForm = (): TaskForm => ({
  name: '', description: '', cron_expression: '0 9 * * *', task_type: 'email_digest',
  enabled: true, task_config: { report_type: 'daily', recipients: '' }, project_id: '',
});

function cronLabel(cron: string): string {
  const preset = PRESET_CRONS.find(p => p.value === cron);
  return preset ? preset.label : cron;
}

function ruleSummary(rule: AutomationRule): string {
  const def = triggerDef(rule.trigger_type);
  const conds = rule.conditions?.length
    ? `if ${rule.conditions.map(c => `${c.field} ${c.op} ${Array.isArray(c.value) ? c.value.join(',') : String(c.value)}`).join(' and ')}`
    : 'if any event';
  const acts = rule.actions?.map(a => ACTION_META[String(a.type)]?.label || String(a.type)).join(', ') || 'no action';
  return `When ${def.label.toLowerCase()} — ${conds} → ${acts}`;
}

function autoref(form: { name: string }): string {
  const seed = (form.name || 'rule').replace(/[^a-z0-9]/gi, '').slice(0, 4).toLowerCase();
  return `new-${seed || 'rule'}`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   The page
───────────────────────────────────────────────────────────────────────────── */

type TabId = 'rules' | 'tasks';

interface SchedulerState { available: boolean; running: boolean | null; jobs: number }

export const AutomationHub: React.FC<{ initialTab?: TabId }> = ({ initialTab = 'rules' }) => {
  const { user, projects } = usePlatform();

  const [tab, setTab] = useState<TabId>(initialTab);
  const [view, setView] = useState<'list' | 'composer'>('list');

  // Rules domain
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [executions, setExecutions] = useState<Record<string, unknown>[]>([]);
  const [ruleLoading, setRuleLoading] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [ruleForm, setRuleForm] = useState<RuleForm>(emptyRuleForm);
  const [testResult, setTestResult] = useState<{ met: boolean } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Tasks domain
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [scheduler, setScheduler] = useState<SchedulerState | null>(null);
  const [taskLoading, setTaskLoading] = useState(false);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);
  const [taskForm, setTaskForm] = useState<TaskForm>(emptyTaskForm);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Shared UI state
  const [error, setError] = useState('');
  const [notice, setNotice] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [confirm, setConfirm] = useState<{ kind: 'delete-rule' | 'bulk-rules' | 'delete-task'; title: string; message: string; payload: unknown } | null>(null);

  // Filters
  const [query, setQuery] = useState('');
  const [fStatus, setFStatus] = useState('all');
  const [fProject, setFProject] = useState('all');
  const [fRuleTrigger, setFRuleTrigger] = useState('all');
  const [fTaskType, setFTaskType] = useState('all');

  const loadedRef = useRef<{ rules: boolean; tasks: boolean }>({ rules: false, tasks: false });

  /* ── Data loading ── */

  const loadRules = useCallback(async () => {
    if (!isApiAvailable()) return;
    setRuleLoading(true);
    setError('');
    try {
      const [r, e] = await Promise.all([
        api.automation.listRules(),
        api.automation.listExecutions(25),
      ]);
      setRules(r as AutomationRule[]);
      setExecutions(e as Record<string, unknown>[]);
    } catch (err) {
      console.error('[Automation] load failed:', err);
      setError('Failed to load automation rules.');
    } finally {
      setRuleLoading(false);
    }
  }, []);

  const loadTasks = useCallback(async () => {
    if (!isApiAvailable()) return;
    setTaskLoading(true);
    setError('');
    try {
      const [t, s] = await Promise.all([
        api.scheduledTasks.list(),
        api.scheduledTasks.status(),
      ]);
      setTasks(t as ScheduledTask[]);
      setScheduler(s as SchedulerState);
    } catch (err) {
      console.error('[ScheduledTasks] load failed:', err);
      setError('Failed to load scheduled tasks.');
    } finally {
      setTaskLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === 'rules') {
      if (!loadedRef.current.rules) { loadedRef.current.rules = true; loadRules(); }
    } else {
      if (!loadedRef.current.tasks) { loadedRef.current.tasks = true; loadTasks(); }
    }
  }, [tab, loadRules, loadTasks]);

  // Navigating between the two sidebar entries must reset and reload fresh.
  useEffect(() => {
    setTab(initialTab);
    setView('list');
    setError('');
    setNotice(null);
    loadedRef.current = { rules: false, tasks: false };
  }, [initialTab]);

  if (!isApiAvailable()) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-12 text-center">
        <Zap size={22} className="text-zinc-600 mx-auto mb-3" />
        <p className="text-sm text-zinc-300 font-medium">Automation needs the backend</p>
        <p className="text-[11px] text-zinc-500 mt-1">Set <span className="font-mono text-zinc-400">VITE_API_URL</span> to configure automation rules and scheduled tasks.</p>
      </div>
    );
  }

  /* ── Derived data ── */

  const ruleStats = useMemo(() => ({
    total: rules.length,
    enabled: rules.filter(r => r.enabled).length,
    runs: rules.reduce((s, r) => s + (r.trigger_count || 0), 0),
  }), [rules]);

  const taskStats = useMemo(() => {
    const enabled = tasks.filter(t => t.enabled);
    let nextLabel = '—';
    let nextTime = Infinity;
    for (const t of enabled) {
      const cand = Date.parse(nextCronRun(t.cron_expression, new Date()));
      if (!Number.isNaN(cand) && cand < nextTime) {
        nextTime = cand;
        nextLabel = nextCronRun(t.cron_expression);
      }
    }
    return { total: tasks.length, active: enabled.length, next: nextLabel };
  }, [tasks]);

  const filteredRules = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter(r => {
      if (q && !`${r.name} ${r.description} ${ruleSummary(r)}`.toLowerCase().includes(q)) return false;
      if (fRuleTrigger !== 'all' && r.trigger_type !== fRuleTrigger) return false;
      if (fProject !== 'all' && r.project_id !== fProject) return false;
      if (fStatus === 'active' && !r.enabled) return false;
      if (fStatus === 'paused' && r.enabled) return false;
      return true;
    });
  }, [rules, query, fRuleTrigger, fProject, fStatus]);

  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter(t => {
      if (q && !`${t.name} ${t.description}`.toLowerCase().includes(q)) return false;
      if (fTaskType !== 'all' && t.task_type !== fTaskType) return false;
      if (fProject !== 'all' && t.project_id !== fProject) return false;
      if (fStatus === 'active' && !t.enabled) return false;
      if (fStatus === 'paused' && t.enabled) return false;
      return true;
    });
  }, [tasks, query, fTaskType, fProject, fStatus]);

  const ruleNameById = useMemo(() => {
    const m = new Map<string, string>();
    rules.forEach(r => m.set(r.id, r.name));
    return m;
  }, [rules]);

  /* ── Reorder (persisted via sort_order) ── */

  const persistRuleOrder = useCallback(async (ordered: AutomationRule[]) => {
    setRules(ordered);
    if (!isApiAvailable()) return;
    try {
      await Promise.all(
        ordered.map((rule, i) => api.automation.updateRule(rule.id, { sort_order: i }).catch(() => null)),
      );
    } catch (err) {
      console.error('[Automation] reorder failed:', err);
    }
  }, []);
  const reorderRules = useDragReorder<AutomationRule>(rules, persistRuleOrder);

  const persistTaskOrder = useCallback(async (ordered: ScheduledTask[]) => {
    setTasks(ordered);
    if (!isApiAvailable()) return;
    try {
      await Promise.all(
        ordered.map((task, i) => api.scheduledTasks.update(task.id, { sort_order: i }).catch(() => null)),
      );
    } catch (err) {
      console.error('[ScheduledTasks] reorder failed:', err);
    }
  }, []);
  const reorderTasks = useDragReorder<ScheduledTask>(tasks, persistTaskOrder);

  /* ── Rules: CRUD ── */

  const openCreateRule = () => {
    setEditingRule(null);
    setRuleForm(emptyRuleForm());
    setTestResult(null);
    setError('');
    setNotice(null);
    setView('composer');
  };

  const openEditRule = (rule: AutomationRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      description: rule.description || '',
      trigger_type: rule.trigger_type,
      project_id: rule.project_id || '',
      enabled: rule.enabled,
      tags: rule.tags || [],
      conditions: (rule.conditions || []).map(c => ({
        field: String(c.field) || 'status',
        op: String(c.op) || 'eq',
        value: Array.isArray(c.value) ? (c.value as string[]).join(', ') : String(c.value ?? ''),
      })),
      actions: (rule.actions || []).map(a => ({ ...a }) as RuleAction),
    });
    setTestResult(null);
    setError('');
    setNotice(null);
    setView('composer');
  };

  const serializeConditions = (conds: RuleForm['conditions']) =>
    conds.map(c => ({
      field: c.field,
      op: c.op,
      value: c.op === 'in' ? c.value.split(',').map((s: string) => s.trim()).filter(Boolean) : c.value,
    }));

  const serializeActions = (acts: RuleForm['actions']) =>
    acts.map(a => {
      const clean: Record<string, unknown> = { type: a.type };
      for (const [k, v] of Object.entries(a)) {
        if (k !== 'type' && v !== '' && v !== undefined) clean[k] = v;
      }
      return clean;
    });

  const buildRulePayload = () => ({
    name: ruleForm.name,
    description: ruleForm.description,
    trigger_type: ruleForm.trigger_type,
    project_id: ruleForm.project_id || null,
    enabled: ruleForm.enabled,
    tags: ruleForm.tags,
    conditions: serializeConditions(ruleForm.conditions),
    actions: serializeActions(ruleForm.actions),
  });

  const handleSaveRule = async () => {
    if (!ruleForm.name.trim()) { setError('Give the rule a name first.'); return; }
    setError('');
    try {
      if (editingRule) await api.automation.updateRule(editingRule.id, buildRulePayload());
      else await api.automation.createRule(buildRulePayload());
      setNotice({ kind: 'success', text: editingRule ? 'Rule updated.' : 'Rule created.' });
      setView('list');
      loadRules();
    } catch (err: any) {
      setError(err?.message || 'Failed to save rule.');
    }
  };

  const handleToggleRule = async (rule: AutomationRule) => {
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    try {
      await api.automation.updateRule(rule.id, { enabled: !rule.enabled });
      setNotice({ kind: 'success', text: `"${rule.name}" ${rule.enabled ? 'paused' : 'resumed'}.` });
    } catch (err) {
      console.error('[Automation] toggle failed:', err);
      setError('Failed to update rule status.');
    }
  };

  const handleDeleteRule = async (rule: AutomationRule) => {
    try {
      await api.automation.deleteRule(rule.id);
      setRules(prev => prev.filter(r => r.id !== rule.id));
      setNotice({ kind: 'success', text: `Rule "${rule.name}" deleted.` });
    } catch (err) {
      console.error('[Automation] delete failed:', err);
      setError('Failed to delete rule.');
    }
  };

  const handleDuplicateRule = async (rule: AutomationRule) => {
    try {
      await api.automation.createRule({
        name: `${rule.name} (copy)`,
        description: rule.description,
        trigger_type: rule.trigger_type,
        project_id: rule.project_id,
        enabled: false,
        tags: rule.tags || [],
        conditions: rule.conditions,
        actions: rule.actions,
      });
      setNotice({ kind: 'success', text: `Duplicated "${rule.name}" — saved as paused.` });
      loadRules();
    } catch (err) {
      console.error('[Automation] duplicate failed:', err);
      setError('Failed to duplicate rule.');
    }
  };

  const handleTestRule = async () => {
    setTestResult(null);
    setError('');
    try {
      const res = await api.automation.testRule(buildRulePayload());
      setTestResult({ met: res.conditions_met });
    } catch (err: any) {
      setError(err?.message || 'Test failed.');
    }
  };

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!confirm) return;
    const ids = [...selected];
    try {
      await Promise.all(ids.map(id => api.automation.deleteRule(id).catch(() => null)));
      setSelected(new Set());
      setNotice({ kind: 'success', text: `${ids.length} rule${ids.length > 1 ? 's' : ''} deleted.` });
      loadRules();
    } catch (err) {
      console.error('[Automation] bulk delete failed:', err);
      setError('Failed to delete rules.');
    }
  };

  /* ── Tasks: CRUD ── */

  const openCreateTask = () => {
    setEditingTask(null);
    setTaskForm(emptyTaskForm());
    setError('');
    setNotice(null);
    setView('composer');
  };

  const openEditTask = (task: ScheduledTask) => {
    setEditingTask(task);
    setTaskForm({
      name: task.name,
      description: task.description || '',
      cron_expression: task.cron_expression,
      task_type: task.task_type,
      enabled: task.enabled,
      task_config: { ...(task.task_config || {}), recipients: String(task.task_config?.recipients || '') },
      project_id: task.project_id || '',
    });
    setError('');
    setNotice(null);
    setView('composer');
  };

  const handleSaveTask = async () => {
    if (!taskForm.name.trim() || !taskForm.cron_expression.trim()) { setError('Name and cron expression are required.'); return; }
    setError('');
    try {
      const cfg: Record<string, unknown> = { ...taskForm.task_config };
      const recipients = String(cfg.recipients || '');
      delete cfg.recipients;
      if (recipients) cfg.recipients = recipients.split(',').map((s: string) => s.trim()).filter(Boolean);

      const payload = {
        name: taskForm.name,
        description: taskForm.description,
        cron_expression: taskForm.cron_expression,
        task_type: taskForm.task_type,
        enabled: taskForm.enabled,
        task_config: cfg,
        project_id: taskForm.project_id || null,
      };
      if (editingTask) await api.scheduledTasks.update(editingTask.id, payload);
      else await api.scheduledTasks.create(payload);
      setNotice({ kind: 'success', text: editingTask ? 'Task updated.' : 'Task created.' });
      setView('list');
      loadTasks();
    } catch (err: any) {
      setError(err?.message || 'Failed to save task.');
    }
  };

  const handleToggleTask = async (task: ScheduledTask) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, enabled: !t.enabled } : t));
    try {
      await api.scheduledTasks.update(task.id, { enabled: !task.enabled });
      setNotice({ kind: 'success', text: `"${task.name}" ${task.enabled ? 'paused' : 'resumed'}.` });
    } catch (err) {
      console.error('[ScheduledTasks] toggle failed:', err);
      setError('Failed to update task status.');
    }
  };

  const handleDeleteTask = async (task: ScheduledTask) => {
    try {
      await api.scheduledTasks.remove(task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
      setNotice({ kind: 'success', text: `Task "${task.name}" deleted.` });
    } catch (err) {
      console.error('[ScheduledTasks] delete failed:', err);
      setError('Failed to delete task.');
    }
  };

  const handleDuplicateTask = async (task: ScheduledTask) => {
    try {
      await api.scheduledTasks.create({
        name: `${task.name} (copy)`,
        description: task.description,
        cron_expression: task.cron_expression,
        task_type: task.task_type,
        enabled: false,
        task_config: task.task_config || {},
        project_id: task.project_id,
      });
      setNotice({ kind: 'success', text: `Duplicated "${task.name}" — saved as paused.` });
      loadTasks();
    } catch (err) {
      console.error('[ScheduledTasks] duplicate failed:', err);
      setError('Failed to duplicate task.');
    }
  };

  const handleRunNow = async (task: ScheduledTask) => {
    setBusyId(task.id);
    setError('');
    setNotice(null);
    try {
      const res = await api.scheduledTasks.run(task.id);
      if (res.status === 'success') {
        setNotice({ kind: 'success', text: `"${task.name}" ran successfully.` });
      } else {
        setNotice({ kind: 'error', text: `"${task.name}" — ${res.detail || 'failed'}` });
      }
      loadTasks();
    } catch (err: any) {
      setError(err?.message || 'Failed to run task.');
    } finally {
      setBusyId(null);
    }
  };

  /* ── Shared toolbar ── */

  const clearFilters = () => {
    setQuery('');
    setFStatus('all');
    setFProject('all');
    setFRuleTrigger('all');
    setFTaskType('all');
  };

  const activeTab = tab;
  const loading = activeTab === 'rules' ? ruleLoading : taskLoading;
  const listEmpty = activeTab === 'rules' ? rules.length === 0 : tasks.length === 0;
  const listFilteredEmpty = activeTab === 'rules' ? filteredRules.length === 0 : filteredTasks.length === 0;

  /* ── Composer chrome (shared) ── */

  const composerBack = () => { setView('list'); setError(''); setNotice(null); setTestResult(null); };

  const composerSheet = (
    editing: { id: string; created_at: string } | null,
    kind: 'RULE' | 'TASK',
    enabled: boolean,
    onToggleEnabled: () => void,
    onSave: () => void,
    saveLabel: string,
  ) => (
    <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
      <button onClick={composerBack} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
        <ChevronLeft size={14} /> {kind === 'RULE' ? 'Automation' : 'Scheduled tasks'}
      </button>
      {editing && (
        <span className="text-[10px] font-mono font-semibold text-zinc-500 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
          {kind}-{editing.id.slice(0, 8).toUpperCase()}
        </span>
      )}
      <div className="flex-1" />
      <div className="flex items-center gap-2.5 mr-2">
        <span className={`text-[10px] font-semibold ${enabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
          {enabled ? 'Active' : 'Paused'}
        </span>
        <button
          onClick={onToggleEnabled}
          role="switch"
          aria-checked={enabled}
          title={enabled ? 'Pause' : 'Resume'}
          className={`relative w-10 h-[22px] rounded-full transition-colors border ${enabled ? 'bg-[#208ab8] border-sky-400/40' : 'bg-zinc-700/60 border-white/[0.1]'}`}
        >
          <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${enabled ? 'left-[22px]' : 'left-[3px]'}`} />
        </button>
      </div>
      <button
        onClick={onSave}
        className="px-4 py-2 rounded-lg bg-white text-black hover:bg-zinc-200 text-xs font-semibold transition-colors"
      >
        {saveLabel}
      </button>
    </div>
  );

  const composerNameRow = (name: string, onChange: (v: string) => void, metaLine: string) => (
    <div className="mt-5">
      <input
        value={name}
        onChange={e => onChange(e.target.value)}
        placeholder={activeTab === 'rules' ? 'Rule name' : 'Task name'}
        aria-label={activeTab === 'rules' ? 'Rule name' : 'Task name'}
        className="w-full bg-transparent border-none text-lg font-semibold text-white placeholder-zinc-700 focus:outline-none"
      />
      <p className="text-[10px] text-zinc-600 mt-0.5">{metaLine}</p>
    </div>
  );

  const inputCls = 'w-full bg-white/[0.03] border border-white/[0.07] text-zinc-200 placeholder-zinc-600 text-xs rounded-lg py-2 px-2.5 focus:outline-none focus:border-white/25 transition-colors';
  const labelCls = 'block text-[10px] font-medium uppercase tracking-wider text-zinc-500 mb-1.5';

  const SectionCard: React.FC<{ step: string; title: string; icon: React.ReactNode; extra?: React.ReactNode; children: React.ReactNode }> = ({ step, title, icon, extra, children }) => (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
      <div className="flex items-center gap-2.5">
        <span className="w-5 h-5 rounded-full bg-white/[0.05] border border-white/[0.1] text-zinc-300 text-[10px] font-bold flex items-center justify-center shrink-0">{step}</span>
        <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-200">{icon}{title}</span>
        {extra && <span className="ml-auto">{extra}</span>}
      </div>
      <div className="mt-3.5">{children}</div>
    </div>
  );

  /* ════════════════════════════════════════════════════════════════════════════
     RULES COMPOSER
  ════════════════════════════════════════════════════════════════════════════ */

  const renderRuleComposer = () => {
    const condCard = (i: number) => (
      <div key={`c${i}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-white/[0.05] border border-white/[0.1] text-[10px] font-bold text-zinc-300 flex items-center justify-center shrink-0">{i + 1}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Condition</span>
          <button onClick={() => setRuleForm({ ...ruleForm, conditions: ruleForm.conditions.filter((_, j) => j !== i) })}
            aria-label="Remove condition"
            className="ml-auto p-1 text-zinc-600 hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"><X size={13} /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <select value={ruleForm.conditions[i].field} onChange={e => setRuleForm({
            ...ruleForm, conditions: ruleForm.conditions.map((c, j) => j === i ? { ...c, field: e.target.value } : c),
          })}
            className="bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-xs rounded-lg py-1.5 px-2 focus:outline-none focus:border-white/25">
            {CONDITION_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={ruleForm.conditions[i].op} onChange={e => setRuleForm({
            ...ruleForm, conditions: ruleForm.conditions.map((c, j) => j === i ? { ...c, op: e.target.value } : c),
          })}
            className="bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-xs rounded-lg py-1.5 px-2 focus:outline-none focus:border-white/25">
            {CONDITION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
          <input value={ruleForm.conditions[i].value} onChange={e => setRuleForm({
            ...ruleForm, conditions: ruleForm.conditions.map((c, j) => j === i ? { ...c, value: e.target.value } : c),
          })}
            placeholder={ruleForm.conditions[i].op === 'in' ? 'critical, high' : 'value'}
            className={`${inputCls} flex-1 min-w-[140px]`} />
        </div>
      </div>
    );

    const actionCard = (i: number) => {
      const action = ruleForm.actions[i];
      const meta = ACTION_META[action.type];
      return (
        <div key={`a${i}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-white/[0.05] border border-white/[0.1] text-[10px] font-bold text-zinc-300 flex items-center justify-center shrink-0">{i + 1}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Action</span>
            {meta?.icon}
            <select value={action.type} onChange={e => setRuleForm({
              ...ruleForm, actions: ruleForm.actions.map((a, j) => j === i ? { type: e.target.value } as RuleAction : a),
            })}
              className="bg-transparent border border-white/[0.07] text-zinc-300 text-xs rounded-lg py-1 px-2 focus:outline-none focus:border-white/25">
              {ACTION_TYPES.map(at => <option key={at} value={at}>{ACTION_META[at].label}</option>)}
            </select>
            <button onClick={() => setRuleForm({ ...ruleForm, actions: ruleForm.actions.filter((_, j) => j !== i) })}
              aria-label="Remove action"
              className="ml-auto p-1 text-zinc-600 hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"><X size={13} /></button>
          </div>
          <div className="mt-2.5 space-y-2">
            {action.type === 'notify' && (
              <div className="flex flex-wrap gap-2">
                <input value={action.title || ''} onChange={e => setRuleForm({
                  ...ruleForm, actions: ruleForm.actions.map((a, j) => j === i ? { ...a, title: e.target.value } : a),
                })} placeholder="Notification title" className={`${inputCls} flex-1 min-w-[160px]`} />
                <input value={action.message || ''} onChange={e => setRuleForm({
                  ...ruleForm, actions: ruleForm.actions.map((a, j) => j === i ? { ...a, message: e.target.value } : a),
                })} placeholder="Message" className={`${inputCls} flex-1 min-w-[160px]`} />
              </div>
            )}
            {action.type === 'email' && (
              <div className="flex flex-wrap gap-2">
                <input value={action.subject || ''} onChange={e => setRuleForm({
                  ...ruleForm, actions: ruleForm.actions.map((a, j) => j === i ? { ...a, subject: e.target.value } : a),
                })} placeholder="Subject" className={`${inputCls} flex-1 min-w-[160px]`} />
                <input value={action.recipient || ''} onChange={e => setRuleForm({
                  ...ruleForm, actions: ruleForm.actions.map((a, j) => j === i ? { ...a, recipient: e.target.value } : a),
                })} placeholder="recipient@email" className={`${inputCls} flex-1 min-w-[160px]`} type="email" />
              </div>
            )}
            {action.type === 'webhook' && (
              <input value={action.url || ''} onChange={e => setRuleForm({
                ...ruleForm, actions: ruleForm.actions.map((a, j) => j === i ? { ...a, url: e.target.value } : a),
              })} placeholder="https://your-endpoint" className={inputCls} type="url" />
            )}
            {action.type === 'comment' && (
              <input value={action.content || ''} onChange={e => setRuleForm({
                ...ruleForm, actions: ruleForm.actions.map((a, j) => j === i ? { ...a, content: e.target.value } : a),
              })} placeholder="Comment to post on the entity" className={inputCls} />
            )}
            {action.type === 'update_status' && (
              <select value={action.status || 'open'} onChange={e => setRuleForm({
                ...ruleForm, actions: ruleForm.actions.map((a, j) => j === i ? { ...a, status: e.target.value } : a),
              })}
                className="bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-xs rounded-lg py-1.5 px-2 focus:outline-none focus:border-white/25">
                <option value="open">Set status: open</option>
                <option value="acknowledged">Set status: acknowledged</option>
                <option value="resolved">Set status: resolved</option>
              </select>
            )}
            {action.type === 'resolve_incident' && (
              <p className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                <CheckCircle size={11} className="text-emerald-400" /> Resolves the triggering incident
              </p>
            )}
          </div>
        </div>
      );
    };

    const isEditing = !!editingRule;
    const metaLine = isEditing && editingRule
      ? `Rule ${editingRule.id.slice(0, 8)} · updated ${timeAgo(editingRule.created_at)}`
      : 'New rule · not saved yet';

    return (
      <div className="max-w-5xl mx-auto pb-10">
        {composerSheet(editingRule, 'RULE', ruleForm.enabled, () => setRuleForm({ ...ruleForm, enabled: !ruleForm.enabled }), handleSaveRule, 'Save rule')}
        {composerNameRow(ruleForm.name, v => setRuleForm({ ...ruleForm, name: v }), metaLine)}

        {error && <div className="mt-3"><StateBanner kind="error" text={error} onDismiss={() => setError('')} /></div>}

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
          {/* Rule details rail */}
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-4 lg:sticky lg:top-4">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Rule details</h4>
            <div>
              <label className={labelCls}>Rule name</label>
              <input value={ruleForm.name} onChange={e => setRuleForm({ ...ruleForm, name: e.target.value })}
                placeholder="e.g. Auto-create incident on deploy failure" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Rule ID</label>
              <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.07] rounded-lg py-2 px-2.5">
                <span className="text-[11px] font-mono text-zinc-300">#{editingRule ? editingRule.id.slice(0, 8) : autoref(ruleForm)}</span>
                <StatusBadge active={ruleForm.enabled} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea value={ruleForm.description} onChange={e => setRuleForm({ ...ruleForm, description: e.target.value })}
                placeholder="What should this rule do?" rows={3}
                className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className={labelCls}>Project</label>
              <select value={ruleForm.project_id} onChange={e => setRuleForm({ ...ruleForm, project_id: e.target.value })}
                className={inputCls}>
                <option value="">All projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={`${labelCls} mb-2`}>Tags</label>
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map(tag => {
                  const on = ruleForm.tags.includes(tag);
                  return (
                    <button key={tag} onClick={() => setRuleForm({
                      ...ruleForm, tags: on ? ruleForm.tags.filter(t => t !== tag) : [...ruleForm.tags, tag],
                    })}
                      aria-pressed={on}
                      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors ${
                        on ? 'bg-sky-500/15 border-sky-400/40 text-sky-300' : 'border-white/[0.08] text-zinc-500 hover:text-zinc-300'
                      }`}>
                      <Tag size={9} /> {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Rule flow */}
          <div className="space-y-3">
            <SectionCard step="1" title="When this happens"
              icon={<RuleIcon type={ruleForm.trigger_type} size={14} />}>
              <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                <span className="text-zinc-500">An event of type</span>
                <select value={ruleForm.trigger_type} onChange={e => setRuleForm({ ...ruleForm, trigger_type: e.target.value })}
                  className="bg-white/[0.03] border border-white/[0.07] text-zinc-200 text-xs rounded-lg py-1.5 px-2.5 focus:outline-none focus:border-white/25">
                  {TRIGGER_DEFS.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </select>
                <span className="text-zinc-500">occurs</span>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {TRIGGER_DEFS.map(t => (
                  <button key={t.type} onClick={() => setRuleForm({ ...ruleForm, trigger_type: t.type })}
                    aria-pressed={ruleForm.trigger_type === t.type}
                    className={`text-left rounded-lg border p-2.5 transition-colors ${
                      ruleForm.trigger_type === t.type
                        ? 'border-white/25 bg-white/[0.05]'
                        : 'border-white/[0.06] hover:border-white/[0.14]'
                    }`}>
                    <div className="flex items-center gap-1.5">
                      <RuleIcon type={t.type} size={12} />
                      <span className="text-[10px] font-semibold text-zinc-200">{t.label}</span>
                    </div>
                    <p className="text-[9px] text-zinc-500 leading-snug mt-1">{t.desc}</p>
                  </button>
                ))}
              </div>
            </SectionCard>

            {ruleForm.conditions.length > 0 && (
              <div className="space-y-2">
                {ruleForm.conditions.map((_, i) => condCard(i))}
              </div>
            )}
            <button onClick={() => setRuleForm({ ...ruleForm, conditions: [...ruleForm.conditions, { field: 'status', op: 'eq', value: '' }] })}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 pl-1 transition-colors">
              <ListPlus size={13} /> Add condition
            </button>

            <SectionCard step="2" title="Then do this"
              icon={<Zap size={14} className="text-zinc-400" />}>
              <div className="space-y-2">
                {ruleForm.actions.map((_, i) => actionCard(i))}
                <button onClick={() => setRuleForm({ ...ruleForm, actions: [...ruleForm.actions, { type: 'notify', title: '', message: '' }] })}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors">
                  <Plus size={13} /> Add action
                </button>
              </div>
            </SectionCard>

            {/* Test + history */}
            <div className="flex flex-col gap-2">
              <button onClick={handleTestRule}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-zinc-300 text-xs transition-colors w-fit">
                <RefreshCw size={13} /> Test rule
              </button>
              {testResult && (
                <div className={`flex items-start gap-2.5 rounded-xl border p-3.5 text-xs ${testResult.met ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'}`}>
                  {testResult.met ? <CheckCircle size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                  <span className="flex-1 leading-relaxed">
                    {testResult.met
                      ? 'Test passed — conditions match the sample event. Ready to activate.'
                      : 'Test failed — conditions do not match the sample event.'}
                  </span>
                </div>
              )}
            </div>

            {isEditing && (
              <div className="pt-1">
                <div className="flex items-center gap-2 mb-2">
                  <History size={13} className="text-zinc-500" />
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Recent activity</h4>
                  <span className="text-[9px] text-zinc-600 font-mono">last {currentRuleExecutions.length}</span>
                </div>
                <ExecutionsList executions={currentRuleExecutions} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const currentRuleExecutions = useMemo(() => {
    if (!editingRule) return [];
    return executions.filter(ex => (ex as any).rule_id === editingRule.id).slice(0, 8);
  }, [executions, editingRule]);

  const ExecutionsList = ({ executions }: { executions: Record<string, unknown>[] }) => (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.05] overflow-hidden">
      {executions.map((ex, i) => {
        const status = (ex.status as string) || 'success';
        return (
          <div key={(ex.id as string) || i} className="flex items-center gap-2.5 px-3.5 py-2.5">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${status === 'success' ? 'bg-emerald-400' : status === 'failed' ? 'bg-red-400' : 'bg-amber-400'}`} />
            <span className="text-[10px] font-mono text-zinc-500 truncate flex-1">{(ex.triggered_by as string) || 'webhook'}</span>
            <ExecBadge status={status} />
            <span className="text-[10px] text-zinc-600 font-mono shrink-0">{timeAgo(ex.executed_at as string)}</span>
          </div>
        );
      })}
    </div>
  );

  /* ════════════════════════════════════════════════════════════════════════════
     TASKS COMPOSER
  ════════════════════════════════════════════════════════════════════════════ */

  const renderTaskComposer = () => {
    const meta = TASK_META[taskForm.task_type] || TASK_META.report;
    const isEditing = !!editingTask;
    const metaLine = isEditing && editingTask
      ? `Task ${editingTask.id.slice(0, 8)} · created ${timeAgo(editingTask.created_at)}`
      : 'New task · not saved yet';

    return (
      <div className="max-w-5xl mx-auto pb-10">
        {composerSheet(editingTask, 'TASK', taskForm.enabled, () => setTaskForm({ ...taskForm, enabled: !taskForm.enabled }), handleSaveTask, 'Save task')}
        {composerNameRow(taskForm.name, v => setTaskForm({ ...taskForm, name: v }), metaLine)}

        {error && <div className="mt-3"><StateBanner kind="error" text={error} onDismiss={() => setError('')} /></div>}

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6 items-start">
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 space-y-4 lg:sticky lg:top-4">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Task details</h4>
            <div>
              <label className={labelCls}>Task name</label>
              <input value={taskForm.name} onChange={e => setTaskForm({ ...taskForm, name: e.target.value })}
                placeholder="e.g. Daily deployment digest" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Task ID</label>
              <div className="flex items-center justify-between bg-white/[0.02] border border-white/[0.07] rounded-lg py-2 px-2.5">
                <span className="text-[11px] font-mono text-zinc-300">#{editingTask ? editingTask.id.slice(0, 8) : 'new-task'}</span>
                <Clock3 size={12} className={taskForm.enabled ? 'text-emerald-400' : 'text-zinc-600'} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <textarea value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })}
                placeholder="What does this task do?" rows={3} className={`${inputCls} resize-none`} />
            </div>
            <div>
              <label className={labelCls}>Project scope</label>
              <select value={taskForm.project_id} onChange={e => setTaskForm({ ...taskForm, project_id: e.target.value })}
                className={inputCls}>
                <option value="">All projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 bg-white/[0.02] border border-white/[0.05] rounded-lg py-2 px-2.5">
              <ServerCog size={12} className={scheduler?.available && scheduler.running !== false ? 'text-emerald-400' : 'text-amber-400'} />
              {scheduler?.available && scheduler.running !== false
                ? `Scheduler live · ${scheduler.jobs ?? 0} jobs`
                : 'Scheduler offline — runs after backend start'}
            </div>
          </div>

          <div className="space-y-3">
            {/* 1. Task type */}
            <SectionCard step="1" title="Task type"
              icon={<span className={meta.glyph.split(' ')[0]}>{meta.icon}</span>}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(TASK_META).map(([type, m]) => (
                  <button key={type} onClick={() => setTaskForm({ ...taskForm, task_type: type })}
                    aria-pressed={taskForm.task_type === type}
                    className={`text-left rounded-lg border p-2.5 transition-colors ${
                      taskForm.task_type === type
                        ? 'border-white/25 bg-white/[0.05]'
                        : 'border-white/[0.06] hover:border-white/[0.14]'
                    }`}>
                    <div className="flex items-center gap-1.5">
                      <span className={m.glyph.split(' ')[0]}>{m.icon}</span>
                      <span className="text-[11px] font-semibold text-zinc-200">{m.label}</span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-snug mt-1">{TASK_TYPE_DESC[type]}</p>
                  </button>
                ))}
              </div>
            </SectionCard>

            {/* 2. Schedule */}
            <SectionCard step="2" title="Schedule"
              icon={<Clock3 size={14} className="text-zinc-400" />}
              extra={
                <span className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-400 bg-white/[0.03] border border-white/[0.07] px-2 py-1 rounded-full">
                  <Clock3 size={11} /> next {nextCronRun(taskForm.cron_expression || '0 0 * * *')}
                </span>
              }>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {PRESET_CRONS.map(p => (
                  <button key={p.value} onClick={() => setTaskForm({ ...taskForm, cron_expression: p.value })}
                    aria-pressed={taskForm.cron_expression === p.value}
                    className={`text-left rounded-lg border p-2 transition-colors ${
                      taskForm.cron_expression === p.value
                        ? 'border-white/25 bg-white/[0.05]'
                        : 'border-white/[0.06] hover:border-white/[0.14]'
                    }`}>
                    <p className="text-[11px] font-semibold text-zinc-200">{p.label}</p>
                    <p className="text-[9px] font-mono text-zinc-500 mt-0.5">{p.value}</p>
                    <p className="text-[8px] text-zinc-600 mt-0.5">{p.desc}</p>
                  </button>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[10px] text-zinc-500 shrink-0">Advanced cron</span>
                <input
                  value={taskForm.cron_expression}
                  onChange={e => setTaskForm({ ...taskForm, cron_expression: e.target.value })}
                  placeholder="0 9 * * *"
                  aria-label="Custom cron expression"
                  className={`${inputCls} flex-1 min-w-[180px] font-mono`}
                />
              </div>
            </SectionCard>

            {/* 3. Configuration */}
            {(taskForm.task_type === 'email_digest' || taskForm.task_type === 'report') && (
              <SectionCard step="3" title="Configuration"
                icon={<SlidersHorizontal size={14} className="text-zinc-400" />}>
                <div className="flex flex-wrap gap-2">
                  <select value={(taskForm.task_config.report_type as string) || 'daily'} onChange={e => setTaskForm(
                    { ...taskForm, task_config: { ...taskForm.task_config, report_type: e.target.value } }
                  )}
                    className="flex-1 min-w-[180px] bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-xs rounded-lg py-2 px-2.5 focus:outline-none focus:border-white/25">
                    <option value="daily">Daily summary</option>
                    <option value="weekly">Weekly summary</option>
                    <option value="deployment_summary">Deployment summary</option>
                    <option value="incident_summary">Incident summary</option>
                  </select>
                  <input value={(taskForm.task_config.recipients as string) || ''} onChange={e => setTaskForm(
                    { ...taskForm, task_config: { ...taskForm.task_config, recipients: e.target.value } }
                  )} placeholder="ops@company.com, dev@company.com"
                    className={`${inputCls} flex-[2] min-w-[220px]`} />
                </div>
              </SectionCard>
            )}
          </div>
        </div>
      </div>
    );
  };

  /* ════════════════════════════════════════════════════════════════════════════
     LIST VIEW
  ════════════════════════════════════════════════════════════════════════════ */

  const bannerStack = (
    <>
      {error && <StateBanner kind="error" text={error} onDismiss={() => setError('')} />}
      {notice && <StateBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}
    </>
  );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2 flex-1 min-w-[220px] bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2">
        <Search size={13} className="text-zinc-500" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={activeTab === 'rules' ? 'Search rules, triggers, actions…' : 'Search tasks, types, cron…'}
          aria-label="Search"
          className="flex-1 bg-transparent text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none" />
        {query && <button onClick={() => setQuery('')} aria-label="Clear search" className="text-zinc-600 hover:text-zinc-300 transition-colors"><X size={12} /></button>}
      </div>

      {activeTab === 'rules' ? (
        <select value={fRuleTrigger} onChange={e => setFRuleTrigger(e.target.value)} aria-label="Filter by trigger"
          className="bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-xs rounded-lg py-2 px-2.5 focus:outline-none">
          <option value="all">All triggers</option>
          {TRIGGER_DEFS.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
        </select>
      ) : (
        <select value={fTaskType} onChange={e => setFTaskType(e.target.value)} aria-label="Filter by type"
          className="bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-xs rounded-lg py-2 px-2.5 focus:outline-none">
          <option value="all">All types</option>
          {Object.entries(TASK_META).map(([type, m]) => <option key={type} value={type}>{m.label}</option>)}
        </select>
      )}

      <select value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Filter by status"
        className="bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-xs rounded-lg py-2 px-2.5 focus:outline-none">
        <option value="all">Any status</option>
        <option value="active">Active</option>
        <option value="paused">Paused</option>
      </select>

      <select value={fProject} onChange={e => setFProject(e.target.value)} aria-label="Filter by project"
        className="bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-xs rounded-lg py-2 px-2.5 focus:outline-none">
        <option value="all">All projects</option>
        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </div>
  );

  const emptyState = (kind: 'rules' | 'tasks', onCreate: () => void) => (
    <div className="bg-white/[0.02] border border-dashed border-white/[0.1] rounded-2xl p-12 text-center">
      <div className="w-12 h-12 mx-auto rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
        {kind === 'rules' ? <Zap size={20} className="text-zinc-400" /> : <CalendarClock size={20} className="text-zinc-400" />}
      </div>
      <p className="text-sm text-zinc-300 font-medium">{kind === 'rules' ? 'No automation rules yet' : 'Nothing scheduled yet'}</p>
      <p className="text-xs text-zinc-500 mt-1.5 max-w-sm mx-auto leading-relaxed">
        {kind === 'rules'
          ? 'React to platform events: when a deployment fails, open an incident and notify the team.'
          : 'Schedule recurring work — daily email digests, health checks, alert syncs or reports.'}
      </p>
      <button onClick={onCreate}
        className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-black hover:bg-zinc-200 text-xs font-semibold transition-colors">
        <Plus size={13} /> {kind === 'rules' ? 'Create your first rule' : 'Schedule your first task'}
      </button>
    </div>
  );

  const noMatches = () => (
    <div className="bg-white/[0.02] border border-dashed border-white/[0.08] rounded-xl p-8 text-center text-xs text-zinc-500">
      <SlidersHorizontal size={16} className="text-zinc-600 mx-auto mb-2" />
      No {activeTab === 'rules' ? 'rules' : 'tasks'} match your search or filters.
      <button onClick={clearFilters} className="block mx-auto mt-2 text-[11px] text-zinc-400 hover:text-zinc-200 hover:underline transition-colors">
        Clear filters
      </button>
    </div>
  );

  const renderRuleRow = (rule: AutomationRule, index: number) => {
    const dragging = reorderRules.isDragging(index);
    const dropTarget = reorderRules.isDropTarget(index);
    return (
      <div
        key={rule.id}
        onDragOver={e => reorderRules.onDragOver(e, index)}
        onDragEnter={e => reorderRules.onDragEnter(e, index)}
        onDrop={e => reorderRules.onDrop(e, index)}
        className={`group flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 transition-colors hover:bg-white/[0.04] ${dragging ? 'opacity-40' : ''} ${dropTarget ? 'ring-1 ring-inset ring-white/40' : ''}`}
      >
        <div
          draggable
          onDragStart={e => reorderRules.onDragStart(e, index, rule.id)}
          onDragEnd={reorderRules.onDragEnd}
          aria-hidden="true"
          className="mt-1 cursor-grab active:cursor-grabbing text-zinc-700 group-hover:text-zinc-400 transition-colors hidden sm:block"
        >
          <GripVertical size={13} />
        </div>
        <label className="flex items-center mt-1 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={selected.has(rule.id)}
            onChange={() => toggleSelected(rule.id)}
            aria-label={`Select ${rule.name}`}
            className="accent-sky-400 w-3.5 h-3.5"
          />
        </label>
        <span className="w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 bg-white/[0.03] border-white/[0.08]">
          <RuleIcon type={rule.trigger_type} size={13} />
        </span>

        <button onClick={() => openEditRule(rule)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-100 truncate">{rule.name}</span>
            {rule.tags?.slice(0, 2).map(t => (
              <span key={t} className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-zinc-400 font-medium">
                <Tag size={9} /> {t}
              </span>
            ))}
          </div>
          <p className="text-[11px] text-zinc-500 truncate mt-0.5">{ruleSummary(rule)}</p>
          <p className="text-[10px] text-zinc-600 mt-1 sm:hidden">
            {rule.trigger_count} run{rule.trigger_count === 1 ? '' : 's'}
            {rule.last_triggered_at ? ` · last ${timeAgo(rule.last_triggered_at)}` : ''}
          </p>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="hidden md:inline-flex items-center gap-1.5 text-[10px] font-mono text-zinc-500 bg-white/[0.03] border border-white/[0.07] px-2 py-1 rounded-full" title="Total executions">
            <History size={10} className="text-zinc-600" /> {rule.trigger_count}
          </span>
          <StatusBadge active={rule.enabled} />
          <button
            onClick={() => handleToggleRule(rule)}
            aria-label={rule.enabled ? `Pause ${rule.name}` : `Resume ${rule.name}`}
            title={rule.enabled ? 'Pause' : 'Resume'}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
          >
            {rule.enabled ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <MenuButton items={[
            { label: 'Duplicate', icon: <Copy size={12} />, onClick: () => handleDuplicateRule(rule) },
            { label: 'Delete', icon: <Trash2 size={12} />, danger: true, onClick: () => setConfirm({
              kind: 'delete-rule', title: 'Delete automation rule?', message: `Delete "${rule.name}"? This cannot be undone.`, payload: rule,
            }) },
          ]} />
        </div>
      </div>
    );
  };

  const renderTaskRow = (task: ScheduledTask, index: number) => {
    const meta = TASK_META[task.task_type] || TASK_META.report;
    const dragging = reorderTasks.isDragging(index);
    const dropTarget = reorderTasks.isDropTarget(index);
    const running = busyId === task.id;
    return (
      <div
        key={task.id}
        onDragOver={e => reorderTasks.onDragOver(e, index)}
        onDragEnter={e => reorderTasks.onDragEnter(e, index)}
        onDrop={e => reorderTasks.onDrop(e, index)}
        className={`group flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5 transition-colors hover:bg-white/[0.04] ${dragging ? 'opacity-40' : ''} ${dropTarget ? 'ring-1 ring-inset ring-white/40' : ''}`}
      >
        <div
          draggable
          onDragStart={e => reorderTasks.onDragStart(e, index, task.id)}
          onDragEnd={reorderTasks.onDragEnd}
          aria-hidden="true"
          className="mt-1 cursor-grab active:cursor-grabbing text-zinc-700 group-hover:text-zinc-400 transition-colors hidden sm:block"
        >
          <GripVertical size={13} />
        </div>
        <span className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 bg-white/[0.03] ${meta.glyph}`}>{meta.icon}</span>

        <button onClick={() => openEditTask(task)} className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-zinc-100 truncate">{task.name}</span>
            <span className="text-[10px] font-mono text-zinc-500 bg-white/[0.03] border border-white/[0.07] px-2 py-0.5 rounded-full">{task.cron_expression}</span>
          </div>
          <p className="text-[11px] text-zinc-500 truncate mt-0.5">
            {task.description || meta.label}
            {task.last_run_at && (
              <>
                <span className="text-zinc-700 mx-1">·</span>last run {timeAgo(task.last_run_at)}
              </>
            )}
          </p>
          <p className="text-[10px] text-zinc-600 mt-1 sm:hidden">Next {nextCronRun(task.cron_expression)}</p>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono text-zinc-500" title="Next run">
            <Clock3 size={10} className="text-zinc-600" /> {nextCronRun(task.cron_expression)}
          </span>
          <StatusBadge active={task.enabled} />
          <button
            onClick={() => handleRunNow(task)}
            disabled={running}
            aria-label={`Run ${task.name} now`}
            title="Run now"
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-[10px] font-mono font-semibold text-zinc-300 border border-white/[0.08] hover:border-emerald-400/40 hover:text-emerald-300 bg-white/[0.03] transition-colors disabled:opacity-50"
          >
            {running ? <Loader size={11} className="animate-spin" /> : <Play size={11} />}
            Run
          </button>
          <button
            onClick={() => handleToggleTask(task)}
            aria-label={task.enabled ? `Pause ${task.name}` : `Resume ${task.name}`}
            title={task.enabled ? 'Pause' : 'Resume'}
            className="p-1.5 rounded-md text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.05] transition-colors"
          >
            {task.enabled ? <Pause size={13} /> : <Play size={13} />}
          </button>
          <MenuButton items={[
            { label: 'Duplicate', icon: <Copy size={12} />, onClick: () => handleDuplicateTask(task) },
            { label: 'Delete', icon: <Trash2 size={12} />, danger: true, onClick: () => setConfirm({
              kind: 'delete-task', title: 'Delete scheduled task?', message: `Delete "${task.name}"? This cannot be undone.`, payload: task,
            }) },
          ]} />
        </div>
      </div>
    );
  };

  const listContent = (() => {
    if (loading) return <SkeletonRows />;
    if (listEmpty) return emptyState(activeTab, activeTab === 'rules' ? openCreateRule : openCreateTask);
    if (listFilteredEmpty) return noMatches();
    return (
      <div className="space-y-2">
        {activeTab === 'rules' ? filteredRules.map(renderRuleRow) : filteredTasks.map(renderTaskRow)}
      </div>
    );
  })();

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            {activeTab === 'rules' ? <Zap size={16} className="text-zinc-400" /> : <CalendarClock size={16} className="text-zinc-400" />}
            Automation
            <span className="text-xs font-normal text-zinc-500">{activeTab === 'rules' ? '· Event rules' : '· Scheduled tasks'}</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-1">
            {activeTab === 'rules'
              ? 'React to platform events with WHEN → IF → THEN workflows.'
              : 'Run recurring automations on a schedule.'}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activeTab === 'tasks' && (
            <span className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] font-medium ${
              scheduler?.available && scheduler.running !== false
                ? 'bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-300'
                : 'bg-amber-500/[0.06] border-amber-500/20 text-amber-300'
            }`}>
              <ServerCog size={13} />
              {scheduler === null ? 'Scheduler state unknown'
                : scheduler.available && scheduler.running !== false ? `Scheduler live · ${scheduler.jobs ?? 0} jobs`
                : 'Scheduler offline'}
              {scheduler?.available && scheduler.running !== false && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
            </span>
          )}
          <button
            onClick={activeTab === 'rules' ? openCreateRule : openCreateTask}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-black hover:bg-zinc-200 text-xs font-semibold transition-colors"
          >
            <Plus size={13} /> New {activeTab === 'rules' ? 'rule' : 'task'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="inline-flex items-center gap-1 rounded-lg border border-white/[0.06] bg-white/[0.02] p-1" role="tablist" aria-label="Automation sections">
        <button
          role="tab" aria-selected={activeTab === 'rules'}
          onClick={() => { setTab('rules'); setView('list'); setError(''); setNotice(null); }}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'rules' ? 'bg-white/[0.07] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Event rules {rules.length > 0 && <span className="ml-1 text-[10px] font-mono opacity-70">{rules.length}</span>}
        </button>
        <button
          role="tab" aria-selected={activeTab === 'tasks'}
          onClick={() => { setTab('tasks'); setView('list'); setError(''); setNotice(null); }}
          className={`px-3.5 py-1.5 rounded-md text-xs font-medium transition-colors ${activeTab === 'tasks' ? 'bg-white/[0.07] text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
        >
          Scheduled tasks {tasks.length > 0 && <span className="ml-1 text-[10px] font-mono opacity-70">{tasks.length}</span>}
        </button>
      </div>

      {(error || notice) && <div className="space-y-2">{bannerStack}</div>}

      {/* Bulk selection bar (rules) */}
      {activeTab === 'rules' && selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5">
          <span className="text-xs text-zinc-300">{selected.size} rule{selected.size > 1 ? 's' : ''} selected</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setSelected(new Set())} className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors">Clear</button>
            <button
              onClick={() => setConfirm({
                kind: 'bulk-rules',
                title: 'Delete selected rules?',
                message: `Delete ${selected.size} rule${selected.size > 1 ? 's' : ''}? This cannot be undone.`,
                payload: null,
              })}
              className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15 transition-colors"
            >
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      )}

      {view === 'composer'
        ? (activeTab === 'rules' ? renderRuleComposer() : renderTaskComposer())
        : (
        <>
          {toolbar}
          {listContent}

          {/* Footer note (tasks) */}
          {activeTab === 'tasks' && !loading && tasks.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
              <ShieldCheck size={11} />
              Tasks run inside the FastAPI process via APScheduler. Restart the backend to reload schedules.
            </div>
          )}
        </>
      )}
    </div>
  );
};