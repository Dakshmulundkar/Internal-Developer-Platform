import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { isApiAvailable } from '../services/api';
import { useDragReorder, timeAgo } from '../hooks/useDragReorder';
import {
  Zap, Plus, Trash2, Play, Power, Bell, Mail, Globe,
  MessageSquare, X, CheckCircle, RefreshCw, Loader, GripVertical,
  AlertTriangle, Rocket, Bug, ChevronDown, ArrowRight, Wand2,
  Braces, Eye, CircleDashed, Tag, ChevronLeft, Search, Filter,
  History, SlidersHorizontal, ListPlus, ArrowDown
} from 'lucide-react';

type ActionType = string;

interface Rule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  sort_order: number;
  project_id: string | null;
  trigger_type: string;
  tags?: string[];
  conditions: Array<{ field: string; op: string; value: unknown }>;
  actions: Array<Record<string, unknown>>;
  trigger_count: number;
  last_triggered_at: string | null;
  created_at: string;
}

interface TriggerDef {
  type: string;
  label: string;
  desc: string;
  icon: 'deploy' | 'incident' | 'alert';
}

const TRIGGER_DEFS: TriggerDef[] = [
  { type: 'deployment.status_change', label: 'Deployment status change', desc: 'Fires when a deployment transitions between states', icon: 'deploy' },
  { type: 'incident.created', label: 'Incident created', desc: 'Fires when a new incident is opened', icon: 'incident' },
  { type: 'alert.fired', label: 'Alert fired', desc: 'Fires when a monitoring alert triggers', icon: 'alert' },
];

const ACTION_META: Record<ActionType, { label: string; icon: React.ReactNode }> = {
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

const emptyForm = () => ({
  name: '',
  description: '',
  trigger_type: 'deployment.status_change',
  project_id: '',
  enabled: true,
  tags: [] as string[],
  conditions: [{ field: 'status', op: 'eq', value: 'failed' }],
  actions: [{ type: 'notify', title: 'Deployment failed', message: 'A deployment just failed.' }],
});

function triggerDef(type: string) {
  return TRIGGER_DEFS.find(t => t.type === type) || TRIGGER_DEFS[0];
}

function TriggerIcon({ type, size = 14 }: { type: string; size?: number }) {
  const def = triggerDef(type);
  const cls = def.icon === 'incident' ? 'text-rose-400' : def.icon === 'alert' ? 'text-amber-400' : 'text-sky-400';
  const Icon = def.icon === 'incident' ? Bug : def.icon === 'alert' ? AlertTriangle : Rocket;
  return <Icon size={size} className={cls} />;
}

// Accent border-left colors per component (Jira-style)
const LINE = {
  trigger: 'border-l-sky-400',
  condition: 'border-l-emerald-400',
  action: 'border-l-violet-400',
};

export const Automation: React.FC = () => {
  const { user, projects } = usePlatform();
  const [rules, setRules] = useState<Rule[]>([]);
  const [executions, setExecutions] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [view, setView] = useState<'list' | 'composer'>('list');
  const [editing, setEditing] = useState<Rule | null>(null);
  const [testResult, setTestResult] = useState<{ met: boolean } | null>(null);

  const [query, setQuery] = useState('');
  const [fTrigger, setFTrigger] = useState('all');
  const [fProject, setFProject] = useState('all');
  const [fStatus, setFStatus] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [form, setForm] = useState(emptyForm());

  const loadAll = useCallback(async () => {
    if (!isApiAvailable()) return;
    setLoading(true);
    try {
      const { api } = await import('../services/api');
      const [r, e] = await Promise.all([
        api.automation.listRules().catch(() => []),
        api.automation.listExecutions(25).catch(() => []),
      ]);
      setRules(r as Rule[]);
      setExecutions(e as Record<string, unknown>[]);
    } catch (err) {
      console.error('[Automation] load failed:', err);
      setError('Failed to load automation rules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const persistOrder = useCallback(async (ordered: Rule[]) => {
    setRules(ordered);
    if (!isApiAvailable()) return;
    try {
      const { api } = await import('../services/api');
      await Promise.all(
        ordered.map((rule, i) =>
          api.automation.updateRule(rule.id, { sort_order: i }).catch(() => null),
        ),
      );
    } catch (err) {
      console.error('[Automation] reorder failed:', err);
    }
  }, []);
  const reorder = useDragReorder<Rule>(rules, persistOrder);

  const stats = useMemo(() => ({
    total: rules.length,
    enabled: rules.filter(r => r.enabled).length,
    runs: rules.reduce((s, r) => s + (r.trigger_count || 0), 0),
  }), [rules]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rules.filter(r => {
      if (q && !`${r.name} ${r.description}`.toLowerCase().includes(q)) return false;
      if (fTrigger !== 'all' && r.trigger_type !== fTrigger) return false;
      if (fProject !== 'all' && r.project_id !== fProject) return false;
      if (fStatus === 'active' && !r.enabled) return false;
      if (fStatus === 'inactive' && r.enabled) return false;
      return true;
    });
  }, [rules, query, fTrigger, fProject, fStatus]);

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} rule${selected.size > 1 ? 's' : ''}?`)) return;
    const { api } = await import('../services/api');
    const ids = [...selected];
    await Promise.all(ids.map(id => api.automation.deleteRule(id).catch(() => null)));
    setSelected(new Set());
    loadAll();
  };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setTestResult(null);
    setView('composer');
  };

  const openEdit = (rule: Rule) => {
    setEditing(rule);
    setForm({
      name: rule.name,
      description: rule.description || '',
      trigger_type: rule.trigger_type,
      project_id: rule.project_id || '',
      enabled: rule.enabled,
      tags: rule.tags || [],
      conditions: (rule.conditions || []).map((c) => ({
        field: (c as Record<string, string>).field || 'status',
        op: (c as Record<string, string>).op || 'eq',
        value: Array.isArray(c.value) ? (c.value as string[]).join(', ') : String(c.value ?? ''),
      })),
      actions: (rule.actions || []).map((a) => ({ ...a })),
    });
    setTestResult(null);
    setView('composer');
  };

  const serializeConditions = (conds: typeof form.conditions) =>
    conds.map(c => ({
      field: c.field,
      op: c.op,
      value: c.op === 'in' ? c.value.split(',').map((s: string) => s.trim()).filter(Boolean) : c.value,
    }));

  const serializeActions = (acts: typeof form.actions) =>
    acts.map(a => {
      const clean: Record<string, unknown> = { type: a.type };
      for (const [k, v] of Object.entries(a)) {
        if (k !== 'type' && v !== '' && v !== undefined) clean[k] = v;
      }
      return clean;
    });

  const buildPayload = () => ({
    name: form.name,
    description: form.description,
    trigger_type: form.trigger_type,
    project_id: form.project_id || null,
    enabled: form.enabled,
    tags: form.tags,
    conditions: serializeConditions(form.conditions),
    actions: serializeActions(form.actions),
  });

  const handleSave = async () => {
    if (!form.name.trim()) { setError('Give the rule a name first.'); return; }
    setError('');
    try {
      const { api } = await import('../services/api');
      if (editing) await api.automation.updateRule(editing.id, buildPayload());
      else await api.automation.createRule(buildPayload());
      setView('list');
      loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to save rule.');
    }
  };

  const handleToggle = async (rule: Rule) => {
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    try {
      const { api } = await import('../services/api');
      await api.automation.updateRule(rule.id, { enabled: !rule.enabled });
    } catch (err) {
      console.error('[Automation] toggle failed:', err);
    }
  };

  const handleDelete = async (rule: Rule) => {
    if (!window.confirm(`Delete rule "${rule.name}"? This cannot be undone.`)) return;
    try {
      const { api } = await import('../services/api');
      await api.automation.deleteRule(rule.id);
      setRules(prev => prev.filter(r => r.id !== rule.id));
    } catch (err) {
      console.error('[Automation] delete failed:', err);
    }
  };

  const handleTest = async () => {
    setTestResult(null);
    setError('');
    try {
      const { api } = await import('../services/api');
      const res = await api.automation.testRule(buildPayload());
      setTestResult({ met: res.conditions_met });
    } catch (err: any) {
      setError(err?.message || 'Test failed.');
    }
  };

  const ruleNameById = useMemo(() => {
    const m = new Map<string, string>();
    rules.forEach(r => m.set(r.id, r.name));
    return m;
  }, [rules]);

  const currentExecutions = useMemo(() => {
    if (!editing) return [];
    return executions.filter((ex: any) => ex.rule_id === editing.id).slice(0, 8);
  }, [executions, editing]);

  if (!isApiAvailable()) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <Zap size={28} className="text-zinc-600 mx-auto mb-3" />
        <p className="text-slate-300 text-sm font-medium">Automation rules need the backend</p>
        <p className="text-[11px] text-zinc-500 mt-1">Set <span className="font-mono text-zinc-400">VITE_API_URL</span> to configure automation rules.</p>
      </div>
    );
  }

  /* ─────────────────────────── JIRA COMPOSER ─────────────────────────── */
  if (view === 'composer') {
    const condCard = (i: number) => (
      <div key={`c${i}`} className={`rounded-xl border border-white/[0.08] border-l-4 ${LINE.condition} bg-[#101014] p-3 shadow-sm`}>
        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-emerald-500/15 text-emerald-300 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">IF</span>
          <span className="text-[10px] text-zinc-600 font-mono">condition</span>
          <button onClick={() => setForm({ ...form, conditions: form.conditions.filter((_, j) => j !== i) })}
            className="ml-auto p-1 text-zinc-600 hover:text-red-400 rounded hover:bg-red-500/10"><X size={13} /></button>
        </div>
        <div className="flex items-center gap-1.5 mt-2.5">
          <select value={form.conditions[i].field} onChange={e => setForm({
            ...form, conditions: form.conditions.map((c, j) => j === i ? { ...c, field: e.target.value } : c),
          })}
            className="bg-white/[0.04] border border-white/[0.08] text-zinc-300 text-[11px] rounded-md py-1.5 px-2 focus:outline-none focus:border-emerald-400/40">
            {CONDITION_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
          <select value={form.conditions[i].op} onChange={e => setForm({
            ...form, conditions: form.conditions.map((c, j) => j === i ? { ...c, op: e.target.value } : c),
          })}
            className="bg-white/[0.04] border border-white/[0.08] text-zinc-300 text-[11px] rounded-md py-1.5 px-2 focus:outline-none focus:border-emerald-400/40">
            {CONDITION_OPS.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
          <input value={String(form.conditions[i].value ?? '')} onChange={e => setForm({
            ...form, conditions: form.conditions.map((c, j) => j === i ? { ...c, value: e.target.value } : c),
          })}
            placeholder={form.conditions[i].op === 'in' ? 'critical, high' : 'value'}
            className="flex-1 bg-white/[0.04] border border-white/[0.08] text-zinc-100 placeholder-zinc-600 rounded-md py-1.5 px-2 text-[11px] focus:outline-none focus:border-emerald-400/40" />
        </div>
      </div>
    );

    const actionCard = (i: number) => {
      const action = form.actions[i];
      const meta = ACTION_META[action.type as ActionType];
      return (
        <div key={`a${i}`} className={`rounded-xl border border-white/[0.08] border-l-4 ${LINE.action} bg-[#101014] p-3 shadow-sm`}>
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-violet-500/15 text-violet-300 text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300">THEN</span>
            {meta?.icon}
            <span className="text-[10px] text-zinc-400 flex items-center gap-1">{meta?.label || action.type}</span>
            <select value={action.type as string} onChange={e => setForm({
              ...form, actions: form.actions.map((a, j) => j === i ? { type: e.target.value } : a),
            })}
              className="bg-transparent border border-white/[0.08] text-zinc-400 text-[10px] rounded-md py-1 px-2 focus:outline-none focus:border-violet-400/40">
              {ACTION_TYPES.map(at => <option key={at} value={at}>{ACTION_META[at].label}</option>)}
            </select>
            <button onClick={() => setForm({ ...form, actions: form.actions.filter((_, j) => j !== i) })}
              className="ml-auto p-1 text-zinc-600 hover:text-red-400 rounded hover:bg-red-500/10"><X size={13} /></button>
          </div>
          <div className="mt-2.5 space-y-1.5">
            {action.type === 'notify' && (
              <div className="flex gap-1.5">
                <input value={(action.title as string) || ''} onChange={e => setForm({
                  ...form, actions: form.actions.map((a, j) => j === i ? { ...a, title: e.target.value } : a),
                })} placeholder="Notification title"
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] text-zinc-100 placeholder-zinc-600 text-[11px] rounded-md py-1.5 px-2 focus:outline-none focus:border-violet-400/40" />
                <input value={(action.message as string) || ''} onChange={e => setForm({
                  ...form, actions: form.actions.map((a, j) => j === i ? { ...a, message: e.target.value } : a),
                })} placeholder="Message"
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] text-zinc-100 placeholder-zinc-600 text-[11px] rounded-md py-1.5 px-2 focus:outline-none focus:border-violet-400/40" />
              </div>
            )}
            {action.type === 'email' && (
              <div className="flex gap-1.5">
                <input value={(action.subject as string) || ''} onChange={e => setForm({
                  ...form, actions: form.actions.map((a, j) => j === i ? { ...a, subject: e.target.value } : a),
                })} placeholder="Subject"
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] text-zinc-100 placeholder-zinc-600 text-[11px] rounded-md py-1.5 px-2 focus:outline-none focus:border-violet-400/40" />
                <input value={(action.recipient as string) || ''} onChange={e => setForm({
                  ...form, actions: form.actions.map((a, j) => j === i ? { ...a, recipient: e.target.value } : a),
                })} placeholder="recipient@email"
                  className="flex-1 bg-white/[0.04] border border-white/[0.08] text-zinc-100 placeholder-zinc-600 text-[11px] rounded-md py-1.5 px-2 focus:outline-none focus:border-violet-400/40" />
              </div>
            )}
            {action.type === 'webhook' && (
              <input value={(action.url as string) || ''} onChange={e => setForm({
                ...form, actions: form.actions.map((a, j) => j === i ? { ...a, url: e.target.value } : a),
              })} placeholder="https://your-endpoint"
                className="w-full bg-white/[0.04] border border-white/[0.08] text-zinc-100 placeholder-zinc-600 text-[11px] rounded-md py-1.5 px-2 focus:outline-none focus:border-violet-400/40" />
            )}
            {action.type === 'comment' && (
              <input value={(action.content as string) || ''} onChange={e => setForm({
                ...form, actions: form.actions.map((a, j) => j === i ? { ...a, content: e.target.value } : a),
              })} placeholder="Comment to post on the entity"
                className="w-full bg-white/[0.04] border border-white/[0.08] text-zinc-100 placeholder-zinc-600 text-[11px] rounded-md py-1.5 px-2 focus:outline-none focus:border-violet-400/40" />
            )}
            {action.type === 'update_status' && (
              <select value={(action.status as string) || 'open'} onChange={e => setForm({
                ...form, actions: form.actions.map((a, j) => j === i ? { ...a, status: e.target.value } : a),
              })} className="bg-transparent border border-white/[0.08] text-zinc-300 rounded-md py-1.5 px-2 text-[11px] focus:outline-none">
                <option value="open">Set status: open</option>
                <option value="acknowledged">Set status: acknowledged</option>
                <option value="resolved">Set status: resolved</option>
              </select>
            )}
            {action.type === 'resolve_incident' && (
              <p className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                <AlertTriangle size={11} className="text-amber-400" /> Resolves the triggering incident
              </p>
            )}
          </div>
        </div>
      );
    };

    return (
      <div className="max-w-5xl mx-auto pb-10">
        {/* Composer top bar */}
        <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
          <button onClick={() => setView('list')}
            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors">
            <ChevronLeft size={14} /> Automation
          </button>
          {view === 'composer' && editing && (
            <span className="text-[10px] font-mono font-semibold text-zinc-500 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
              RULE-{editing.id.slice(0, 8).toUpperCase()}
            </span>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-2.5 mr-2">
            <span className={`text-[10px] font-semibold ${form.enabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {form.enabled ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={() => setForm({ ...form, enabled: !form.enabled })}
              title={form.enabled ? 'Deactivate this rule' : 'Activate this rule'}
              className={`relative w-10 h-[22px] rounded-full transition-colors border ${
                form.enabled ? 'bg-[#208ab8] border-sky-400/40' : 'bg-zinc-700/60 border-white/[0.1]'
              }`}>
              <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${form.enabled ? 'left-[22px]' : 'left-[3px]'}`} />
            </button>
          </div>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-white text-black hover:bg-zinc-200 text-[11px] font-bold transition-all">
            Save rule
          </button>
        </div>

        {/* Name row */}
        <div className="mt-5">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Rule name"
            className="w-full bg-transparent border-none text-lg font-semibold text-white placeholder-zinc-700 focus:outline-none" />
          <p className="text-[10px] text-zinc-600 mt-0.5">
            {editing ? `Rule ${editing.id.slice(0, 8)} · updated ${timeAgo(editing.created_at)}` : 'New rule · not saved yet'}
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
          {/* ── Rule details card ── */}
          <div className="bg-[#101014] border border-white/[0.08] rounded-xl p-4 space-y-4 lg:sticky lg:top-4">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Rule details</h4>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Rule name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Auto-create incident on deploy failure"
                className="w-full bg-black/30 border border-white/[0.08] text-zinc-100 placeholder-zinc-600 text-[11px] rounded-md py-2 px-2.5 focus:outline-none focus:border-sky-400/40" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Rule ID</label>
              <div className="flex items-center justify-between bg-black/30 border border-white/[0.08] rounded-md py-2 px-2.5">
                <span className="text-[11px] font-mono text-zinc-300">#{editing ? editing.id.slice(0, 8) : autoref(form)}</span>
                <Power size={12} className={form.enabled ? 'text-emerald-400' : 'text-zinc-600'} />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="What should this rule do?"
                rows={3}
                className="w-full bg-black/30 border border-white/[0.08] text-zinc-100 placeholder-zinc-600 text-[11px] rounded-md py-2 px-2.5 focus:outline-none focus:border-sky-400/40 resize-none" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Project</label>
              <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}
                className="w-full bg-black/30 border border-white/[0.08] text-zinc-300 text-[11px] rounded-md py-2 px-2.5 focus:outline-none focus:border-sky-400/40">
                <option value="">All projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1.5">Tags</label>
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map(tag => {
                  const on = form.tags.includes(tag);
                  return (
                    <button key={tag} onClick={() => setForm({
                      ...form, tags: on ? form.tags.filter(t => t !== tag) : [...form.tags, tag],
                    })}
                      className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-all ${
                        on ? 'bg-sky-500/15 border-sky-400/40 text-sky-300' : 'border-white/[0.08] text-zinc-500 hover:text-zinc-300'
                      }`}>
                      <Tag size={9} /> {tag}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Component flow ── */}
          <div className="space-y-2">
            {/* WHEN */}
            <div className={`rounded-xl border border-white/[0.08] border-l-4 ${LINE.trigger} bg-[#101014] p-4 shadow-sm`}>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-sky-500/15 text-sky-300 text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
                <TriggerIcon type={form.trigger_type} />
                <div className="flex-1">
                  <p className="flex items-center gap-2 text-xs text-zinc-300">
                    <span className="font-bold text-sky-300 uppercase tracking-wider text-[10px]">When</span>
                    <span className="text-zinc-500">an event of type</span>
                    <select value={form.trigger_type} onChange={e => setForm({ ...form, trigger_type: e.target.value })}
                      className="bg-transparent border border-white/[0.08] text-zinc-100 text-[11px] rounded-md py-1 px-2 focus:outline-none focus:border-sky-400/40">
                      {TRIGGER_DEFS.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                    </select>
                    <span className="text-zinc-500">occurs</span>
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
                {TRIGGER_DEFS.map(t => (
                  <button key={t.type} onClick={() => setForm({ ...form, trigger_type: t.type })}
                    className={`text-left rounded-lg border p-2.5 transition-all ${
                      form.trigger_type === t.type
                        ? 'border-sky-400/40 bg-sky-500/[0.07] ring-1 ring-sky-400/20'
                        : 'border-white/[0.06] hover:border-white/[0.12]'
                    }`}>
                    <div className="flex items-center gap-1.5">
                      <TriggerIcon type={t.type} size={12} />
                      <span className="text-[10px] font-semibold text-zinc-200">{t.label}</span>
                    </div>
                    <p className="text-[9px] text-zinc-500 leading-snug mt-1">{t.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Connector + add */}
            <div className="flex flex-col items-center py-1">
              <span className="w-7 h-7 rounded-full bg-white/[0.03] border border-dashed border-white/[0.15] flex items-center justify-center text-zinc-500 hover:text-white hover:border-sky-400/40 cursor-pointer">
                <Plus size={13} />
              </span>
              <div className="w-px h-3 bg-white/[0.08]" />
              <span className="text-[9px] text-zinc-600 mt-1 flex items-center gap-1">
                <ListPlus size={10} /> New condition or action
              </span>
            </div>

            {/* Conditions */}
            {form.conditions.length > 0 && (
              <div className="space-y-2 mb-1">
                {form.conditions.map((_, i) => condCard(i))}
              </div>
            )}
            <button onClick={() => setForm({ ...form, conditions: [...form.conditions, { field: 'status', op: 'eq', value: '' }] })}
              className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-emerald-300 pl-1">
              <Plus size={12} /> Add condition
            </button>

            {/* Connector */}
            <div className="flex flex-col items-center py-1">
              <span className="w-7 h-7 rounded-full bg-white/[0.03] border border-dashed border-white/[0.15] flex items-center justify-center text-zinc-500 hover:text-white hover:border-violet-400/40 cursor-pointer">
                <ArrowDown size={13} />
              </span>
            </div>

            {/* Actions */}
            {form.actions.length > 0 && (
              <div className="space-y-2">
                {form.actions.map((_, i) => actionCard(i))}
              </div>
            )}
            <button onClick={() => setForm({ ...form, actions: [...form.actions, { type: 'notify', title: '', message: '' }] })}
              className="flex items-center gap-1.5 text-[11px] text-zinc-400 hover:text-violet-300 pl-1">
              <Plus size={12} /> Add action
            </button>

            {/* Test area */}
            <div className="pt-3">
              <button onClick={handleTest}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] text-zinc-300 text-[11px] transition-all">
                <CircleDashed size={13} /> Test rule
              </button>
              {testResult && (
                <div className={`mt-2.5 rounded-lg border-l-4 px-3.5 py-2.5 text-xs flex items-center gap-2 ${
                  testResult.met
                    ? 'border-l-emerald-400 bg-emerald-500/[0.06] text-emerald-300'
                    : 'border-l-amber-400 bg-amber-500/[0.06] text-amber-300'
                }`}>
                  <Eye size={13} className="shrink-0" />
                  {testResult.met
                    ? 'Test passed — conditions match the sample event. Ready to activate.'
                    : 'Test failed — conditions do not match the sample event.'}
                </div>
              )}
            </div>

            {/* Rule audit log */}
            {editing && currentExecutions.length > 0 && (
              <div className="pt-3">
                <div className="flex items-center gap-2 mb-2">
                  <History size={13} className="text-zinc-500" />
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Audit log</h4>
                  <span className="text-[9px] text-zinc-600 font-mono">last {currentExecutions.length}</span>
                </div>
                <div className="bg-[#101014] border border-white/[0.08] rounded-xl divide-y divide-white/[0.05] overflow-hidden">
                  {currentExecutions.map((ex, i) => {
                    const status = (ex.status as string) || 'success';
                    return (
                      <div key={(ex.id as string) || i} className="flex items-center gap-2 px-3 py-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          status === 'success' ? 'bg-emerald-400' : status === 'failed' ? 'bg-red-400' : 'bg-amber-400'
                        }`} />
                        <span className="text-[10px] font-mono text-zinc-500 truncate flex-1">
                          {(ex.triggered_by as string) || 'webhook'}
                        </span>
                        <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                          status === 'success' ? 'text-emerald-300 bg-emerald-500/10' : 'text-amber-300 bg-amber-500/10'
                        }`}>{status}</span>
                        <span className="text-[9px] text-zinc-600 font-mono shrink-0">{timeAgo(ex.executed_at as string)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────── JIRA LIST / CATALOG ─────────────────────────── */
  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      {/* Jira-style page header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <Zap size={15} className="text-sky-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">Automation rules</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">WHEN → IF → THEN workflows triggered by platform events</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-600 bg-white/[0.03] border border-white/[0.06] px-2 py-1 rounded">
            {stats.total} rules · {stats.enabled} active · {stats.runs} runs
          </span>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-black hover:bg-zinc-200 text-xs font-semibold transition-all">
            <Plus size={13} /> Create rule
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-xl p-3.5 flex items-start gap-2.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-amber-400/60 hover:text-amber-300"><X size={13} /></button>
        </div>
      )}

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Rules', value: stats.total, icon: <Braces size={13} className="text-zinc-400" /> },
          { label: 'Active', value: stats.enabled, icon: <Power size={13} className="text-emerald-400" /> },
          { label: 'Total executions', value: stats.runs, icon: <Play size={13} className="text-blue-400" /> },
        ].map(s => (
          <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">{s.icon}</div>
            <div>
              <p className="text-lg font-bold text-white leading-none">{s.value}</p>
              <p className="text-[10px] text-zinc-500 mt-1">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar: search + filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[220px] bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2">
          <Search size={13} className="text-zinc-500" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search automation rules"
            className="flex-1 bg-transparent text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none" />
          {query && <button onClick={() => setQuery('')} className="text-zinc-600 hover:text-zinc-300"><X size={12} /></button>}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
          <Filter size={12} className="text-zinc-600" />
          <select value={fTrigger} onChange={e => setFTrigger(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-[11px] rounded-lg py-2 px-2 focus:outline-none">
            <option value="all">All triggers</option>
            {TRIGGER_DEFS.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
          <select value={fProject} onChange={e => setFProject(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-[11px] rounded-lg py-2 px-2 focus:outline-none">
            <option value="all">All projects</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select value={fStatus} onChange={e => setFStatus(e.target.value)}
            className="bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-[11px] rounded-lg py-2 px-2 focus:outline-none">
            <option value="all">Any status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
        <button onClick={bulkDelete} disabled={selected.size === 0}
          className={`flex items-center gap-1.5 text-[11px] px-2 py-2 rounded-lg border transition-all ${
            selected.size > 0 ? 'border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15' : 'border-white/[0.06] text-zinc-600 cursor-not-allowed'
          }`}>
          <Trash2 size={12} /> Delete
        </button>
      </div>

      {/* Rules table */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-10 justify-center">
          <Loader size={14} className="animate-spin" /> Loading rules…
        </div>
      ) : rules.length === 0 ? (
        <div className="bg-white/[0.02] border border-dashed border-white/[0.1] rounded-2xl p-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-sky-500/10 to-violet-500/5 border border-white/10 flex items-center justify-center mb-3">
            <Wand2 size={20} className="text-sky-300" />
          </div>
          <p className="text-sm text-slate-300 font-medium">Create automation through templates and custom rules</p>
          <p className="text-[11px] text-zinc-500 mt-1.5 max-w-sm mx-auto">
            Start with a template like “When a deployment fails, create an incident and notify the team”, or build a custom rule from scratch.
          </p>
          <button onClick={openCreate}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1b6f93] hover:bg-[#208ab8] text-white text-xs font-bold transition-all">
            <Plus size={13} /> Create custom rule
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white/[0.02] border border-dashed border-white/[0.08] rounded-xl p-8 text-center text-xs text-zinc-500">
          <SlidersHorizontal size={16} className="text-zinc-600 mx-auto mb-2" />
          No rules match your search or filters.
        </div>
      ) : (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                <th className="py-3 px-3 w-8">
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every(r => selected.has(r.id))}
                    onChange={() => {
                      const all = filtered.every(r => selected.has(r.id));
                      setSelected(prev => {
                        const next = new Set(prev);
                        filtered.forEach(r => all ? next.delete(r.id) : next.add(r.id));
                        return next;
                      });
                    }}
                    className="accent-sky-400" />
                </th>
                <th className="py-3 px-2 w-6"><GripVertical size={12} className="text-zinc-700" /></th>
                <th className="py-3 px-3">Rule</th>
                <th className="py-3 px-3 hidden md:table-cell">Tags</th>
                <th className="py-3 px-3 text-right hidden sm:table-cell">Executions</th>
                <th className="py-3 px-4 text-right w-32">Status</th>
                <th className="py-3 px-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map((rule, index) => {
                const def = triggerDef(rule.trigger_type);
                const dragging = reorder.isDragging(index);
                const dropTarget = reorder.isDropTarget(index);
                return (
                  <tr key={rule.id}
                    onDragOver={e => reorder.onDragOver(e, index)}
                    onDragEnter={e => reorder.onDragEnter(e, index)}
                    onDrop={e => reorder.onDrop(e, index)}
                    draggable
                    onDragStart={e => reorder.onDragStart(e, index, rule.id)}
                    onDragEnd={reorder.onDragEnd}
                    onClick={() => openEdit(rule)}
                    className={`group cursor-pointer transition-colors ${dragging ? 'opacity-40 bg-sky-500/[0.04]' : 'hover:bg-white/[0.03]'} ${!rule.enabled ? 'opacity-60' : ''} ${dropTarget ? 'ring-2 ring-inset ring-sky-400/50' : ''}`}>
                    <td className="py-3.5 px-3 w-8" onClick={e => e.stopPropagation()}>
                      <input type="checkbox"
                        checked={selected.has(rule.id)}
                        onChange={() => toggleSelected(rule.id)}
                        className="accent-sky-400" />
                    </td>
                    <td className="py-3.5 px-2 w-6 cursor-grab active:cursor-grabbing text-zinc-700 group-hover:text-zinc-400" onClick={e => e.stopPropagation()}>
                      <GripVertical size={13} />
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${
                          def.icon === 'incident' ? 'border-rose-500/20 bg-rose-500/[0.06]'
                          : def.icon === 'alert' ? 'border-amber-500/20 bg-amber-500/[0.06]'
                          : 'border-sky-500/20 bg-sky-500/[0.06]'
                        }`}>
                          <TriggerIcon type={rule.trigger_type} size={13} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-100 truncate flex items-center gap-1.5">
                            <span className="text-[9px] font-mono text-zinc-600">{rule.sort_order + 1}.</span>
                            {rule.name}
                          </p>
                          <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                            <span className="text-zinc-600">WHEN</span> {def.label}
                            {rule.conditions.length > 0 && (
                              <>
                                <span className="text-zinc-700 mx-1">·</span>
                                <span className="text-zinc-600">IF</span> {rule.conditions.map(c => `${c.field} ${c.op} ${Array.isArray(c.value) ? c.value.join(',') : String(c.value)}`).join(' + ')}
                              </>
                            )}
                            <span className="text-zinc-700 mx-1">→</span>
                            <span className="text-zinc-600">THEN</span> {rule.actions.map(a => ACTION_META[a.type as ActionType]?.label || a.type).join(' + ')}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 hidden md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {rule.tags?.length
                          ? rule.tags.map((t: string) => (
                              <span key={t} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-sky-400/30 bg-sky-500/10 text-sky-300 font-medium">
                                {t}
                              </span>
                            ))
                          : <span className="text-[10px] text-zinc-600">—</span>}
                      </div>
                    </td>
                    <td className="py-3.5 px-3 text-right hidden sm:table-cell">
                      <span className="text-[11px] font-mono text-zinc-400">{rule.trigger_count}</span>
                    </td>
                    <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleToggle(rule)}
                        title={rule.enabled ? 'Deactivate' : 'Activate'}
                        className={`relative w-10 h-[22px] rounded-full transition-colors border ${
                          rule.enabled ? 'bg-[#208ab8] border-sky-400/40' : 'bg-zinc-700/60 border-white/[0.1]'
                        }`}>
                        <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${rule.enabled ? 'left-[22px]' : 'left-[3px]'}`} />
                      </button>
                    </td>
                    <td className="py-3.5 px-3 w-10 text-right" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleDelete(rule)}
                        className="p-1.5 text-zinc-600 hover:text-red-400 rounded hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer: recent executions */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <History size={13} className="text-blue-400" />
          <h3 className="text-xs font-semibold text-white tracking-wide">Automation audit log</h3>
        </div>
        {executions.length === 0 ? (
          <div className="bg-white/[0.02] border border-dashed border-white/[0.08] rounded-xl p-6 text-center text-xs text-zinc-500">
            <CircleDashed size={18} className="text-zinc-600 mx-auto mb-2" />
            No executions yet — they appear when a webhook event matches a rule.
          </div>
        ) : (
          <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                  <th className="py-3 px-4">Rule</th>
                  <th className="py-3 px-4">Triggered by</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4 text-right">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {executions.map((ex, i) => {
                  const status = (ex.status as string) || 'success';
                  return (
                    <tr key={(ex.id as string) || i} className="hover:bg-white/[0.02] transition-colors">
                      <td className="py-2.5 px-4 text-zinc-300 font-medium max-w-[220px] truncate">
                        {ruleNameById.get(ex.rule_id as string) || String(ex.rule_id).slice(0, 8)}
                      </td>
                      <td className="py-2.5 px-4 text-[10px] font-mono text-zinc-500">
                        <span className="flex items-center gap-1"><Zap size={10} className="text-zinc-600" />{(ex.triggered_by as string) || '—'}</span>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-full ${
                          status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : status === 'failed' ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                          : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {status === 'success' ? <CheckCircle size={9} /> : status === 'failed' ? <X size={9} /> : <CircleDashed size={9} />}
                          {status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right text-[10px] text-zinc-500 font-mono">{timeAgo(ex.executed_at as string)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {user && <div className="h-2" />}
    </div>
  );
};

// Stable pseudo-ID for brand-new (unsaved) rules
function autoref(form: { name: string }): string {
  const seed = (form.name || 'rule').replace(/[^a-z0-9]/gi, '').slice(0, 4).toLowerCase();
  return `new-${seed || 'rule'}`;
}