import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { isApiAvailable } from '../services/api';
import { useDragReorder, timeAgo, nextCronRun } from '../hooks/useDragReorder';
import {
  CalendarClock, Plus, Trash2, Play, X, Loader, GripVertical,
  AlertTriangle, Mail, HeartPulse, RefreshCw, FileBarChart,
  CheckCircle, ServerCog, CircleDashed, Clock3, ChevronLeft,
  Search, SlidersHorizontal, Tag, ListPlus, ArrowDown, History
} from 'lucide-react';

interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  sort_order: number;
  cron_expression: string;
  task_type: string;
  task_config: Record<string, unknown>;
  project_id: string | null;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
}

const TASK_META: Record<string, { label: string; icon: React.ReactNode; glyph: string; line: string }> = {
  email_digest: { label: 'Email digest', icon: <Mail size={13} />, glyph: 'text-violet-400 bg-violet-500/10 border-violet-500/20', line: 'border-l-violet-400' },
  health_check: { label: 'Health check', icon: <HeartPulse size={13} />, glyph: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', line: 'border-l-emerald-400' },
  alert_sync: { label: 'Alert sync', icon: <RefreshCw size={13} />, glyph: 'text-amber-400 bg-amber-500/10 border-amber-500/20', line: 'border-l-amber-400' },
  report: { label: 'Report', icon: <FileBarChart size={13} />, glyph: 'text-sky-400 bg-sky-500/10 border-sky-500/20', line: 'border-l-sky-400' },
};

const PRESET_CRONS = [
  { label: 'Daily 9am', value: '0 9 * * *', desc: 'Once a day' },
  { label: 'Hourly', value: '0 * * * *', desc: 'On the hour' },
  { label: 'Weekly Mon', value: '0 9 * * 1', desc: 'Every Monday' },
  { label: 'Midnight', value: '0 0 * * *', desc: 'Daily rollover' },
  { label: 'Every 15m', value: '*/15 * * * *', desc: 'Quarter-hour' },
];

const emptyForm = () => ({
  name: '',
  description: '',
  cron_expression: '0 9 * * *',
  task_type: 'email_digest',
  enabled: true,
  task_config: { report_type: 'daily', recipients: '' } as Record<string, unknown>,
  project_id: '',
});

export const ScheduledTasks: React.FC = () => {
  const { user, projects } = usePlatform();
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [status, setStatus] = useState<{ available: boolean; running: boolean | null; jobs: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [view, setView] = useState<'list' | 'composer'>('list');
  const [editing, setEditing] = useState<ScheduledTask | null>(null);
  const [form, setForm] = useState(emptyForm());

  const [query, setQuery] = useState('');
  const [fType, setFType] = useState('all');
  const [fStatus, setFStatus] = useState('all');

  const loadAll = useCallback(async () => {
    if (!isApiAvailable()) return;
    setLoading(true);
    try {
      const { api } = await import('../services/api');
      const [t, s] = await Promise.all([
        api.scheduledTasks.list().catch(() => []),
        api.scheduledTasks.status().catch(() => null),
      ]);
      setTasks(t as ScheduledTask[]);
      setStatus(s as typeof status);
    } catch (err) {
      console.error('[ScheduledTasks] load failed:', err);
      setError('Failed to load scheduled tasks.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const persistOrder = useCallback(async (ordered: ScheduledTask[]) => {
    setTasks(ordered);
    if (!isApiAvailable()) return;
    try {
      const { api } = await import('../services/api');
      await Promise.all(
        ordered.map((task, i) =>
          api.scheduledTasks.update(task.id, { sort_order: i }).catch(() => null),
        ),
      );
    } catch (err) {
      console.error('[ScheduledTasks] reorder failed:', err);
    }
  }, []);
  const reorder = useDragReorder<ScheduledTask>(tasks, persistOrder);

  const stats = useMemo(() => {
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter(t => {
      if (q && !`${t.name} ${t.description}`.toLowerCase().includes(q)) return false;
      if (fType !== 'all' && t.task_type !== fType) return false;
      if (fStatus === 'active' && !t.enabled) return false;
      if (fStatus === 'inactive' && t.enabled) return false;
      return true;
    });
  }, [tasks, query, fType, fStatus]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setView('composer');
  };

  const openEdit = (task: ScheduledTask) => {
    setEditing(task);
    setForm({
      name: task.name,
      description: task.description || '',
      cron_expression: task.cron_expression,
      task_type: task.task_type,
      enabled: task.enabled,
      task_config: { ...(task.task_config || {}), recipients: (task.task_config?.recipients as string) || '' },
      project_id: task.project_id || '',
    });
    setView('composer');
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.cron_expression.trim()) { setError('Name and cron expression are required.'); return; }
    setError('');
    try {
      const { api } = await import('../services/api');
      const cfg: Record<string, unknown> = { ...form.task_config };
      const recipients = String(cfg.recipients || '');
      delete cfg.recipients;
      if (recipients) cfg.recipients = recipients.split(',').map((s: string) => s.trim()).filter(Boolean);

      const payload = {
        name: form.name,
        description: form.description,
        cron_expression: form.cron_expression,
        task_type: form.task_type,
        enabled: form.enabled,
        task_config: cfg,
        project_id: form.project_id || null,
      };
      if (editing) await api.scheduledTasks.update(editing.id, payload);
      else await api.scheduledTasks.create(payload);
      setView('list');
      loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to save task.');
    }
  };

  const handleToggle = async (task: ScheduledTask) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, enabled: !t.enabled } : t));
    try {
      const { api } = await import('../services/api');
      await api.scheduledTasks.update(task.id, { enabled: !task.enabled });
    } catch (err) { console.error('[ScheduledTasks] toggle failed:', err); }
  };

  const handleDelete = async (task: ScheduledTask) => {
    if (!window.confirm(`Delete scheduled task "${task.name}"?`)) return;
    try {
      const { api } = await import('../services/api');
      await api.scheduledTasks.remove(task.id);
      setTasks(prev => prev.filter(t => t.id !== task.id));
    } catch (err) { console.error('[ScheduledTasks] delete failed:', err); }
  };

  const handleRunNow = async (task: ScheduledTask) => {
    setBusyId(task.id);
    setError('');
    try {
      const { api } = await import('../services/api');
      const res = await api.scheduledTasks.run(task.id);
      setError(res.status === 'success' ? `✓ ${task.name} ran successfully.` : `${task.name}: ${res.detail || 'failed'}`);
      loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to run task.');
    } finally {
      setBusyId(null);
    }
  };

  if (!isApiAvailable()) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-center">
        <CalendarClock size={28} className="text-zinc-600 mx-auto mb-3" />
        <p className="text-slate-300 text-sm font-medium">Scheduled tasks need the backend</p>
        <p className="text-[11px] text-zinc-500 mt-1">Set <span className="font-mono text-zinc-400">VITE_API_URL</span> to schedule recurring automations.</p>
      </div>
    );
  }

  /* ─────────────────────────── COMPOSER ─────────────────────────── */
  if (view === 'composer') {
    const meta = TASK_META[form.task_type] || TASK_META.report;
    return (
      <div className="max-w-5xl mx-auto pb-10">
        {/* Composer top bar */}
        <div className="flex items-center gap-3 pb-4 border-b border-white/[0.06]">
          <button onClick={() => setView('list')}
            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition-colors">
            <ChevronLeft size={14} /> Scheduled tasks
          </button>
          {editing && (
            <span className="text-[10px] font-mono font-semibold text-zinc-500 bg-white/[0.04] border border-white/[0.06] px-2 py-0.5 rounded-full">
              TASK-{editing.id.slice(0, 8).toUpperCase()}
            </span>
          )}
          <div className="flex-1" />
          <div className="flex items-center gap-2.5 mr-2">
            <span className={`text-[10px] font-semibold ${form.enabled ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {form.enabled ? 'Active' : 'Inactive'}
            </span>
            <button
              onClick={() => setForm({ ...form, enabled: !form.enabled })}
              title={form.enabled ? 'Pause task' : 'Activate task'}
              className={`relative w-10 h-[22px] rounded-full transition-colors border ${
                form.enabled ? 'bg-[#208ab8] border-sky-400/40' : 'bg-zinc-700/60 border-white/[0.1]'
              }`}>
              <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${form.enabled ? 'left-[22px]' : 'left-[3px]'}`} />
            </button>
          </div>
          <button onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-white text-black hover:bg-zinc-200 text-[11px] font-bold transition-all">
            Save task
          </button>
        </div>

        {/* Name row */}
        <div className="mt-5">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            placeholder="Task name"
            className="w-full bg-transparent border-none text-lg font-semibold text-white placeholder-zinc-700 focus:outline-none" />
          <p className="text-[10px] text-zinc-600 mt-0.5">
            {editing ? `Task ${editing.id.slice(0, 8)} · created ${timeAgo(editing.created_at)}` : 'New task · not saved yet'}
          </p>
        </div>

        {error && (
          <div className={`mt-3 ${
            error.startsWith('✓') ? 'bg-emerald-500/[0.06] border-l-emerald-400 text-emerald-300' : 'bg-amber-500/[0.06] border-l-amber-400 text-amber-300'
          } border border-white/[0.08] rounded-lg px-3.5 py-2.5 text-xs flex items-start gap-2`}>
            {error.startsWith('✓') ? <CheckCircle size={13} className="mt-0.5 shrink-0" /> : <AlertTriangle size={13} className="mt-0.5 shrink-0" />}
            <span className="flex-1">{error.replace(/^✓\s*/, '')}</span>
            <button onClick={() => setError('')} className="text-amber-400/50 hover:text-amber-300"><X size={12} /></button>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 items-start">
          {/* Task details */}
          <div className="bg-[#101014] border border-white/[0.08] rounded-xl p-4 space-y-4 lg:sticky lg:top-4">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Task details</h4>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Task name</label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Daily deployment digest"
                className="w-full bg-black/30 border border-white/[0.08] text-zinc-100 placeholder-zinc-600 text-[11px] rounded-md py-2 px-2.5 focus:outline-none focus:border-sky-400/40" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Task ID</label>
              <div className="flex items-center justify-between bg-black/30 border border-white/[0.08] rounded-md py-2 px-2.5">
                <span className="text-[11px] font-mono text-zinc-300">#{editing ? editing.id.slice(0, 8) : 'new-task'}</span>
                <Clock3 size={12} className={form.enabled ? 'text-emerald-400' : 'text-zinc-600'} />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="What does this task do?"
                rows={3}
                className="w-full bg-black/30 border border-white/[0.08] text-zinc-100 placeholder-zinc-600 text-[11px] rounded-md py-2 px-2.5 focus:outline-none focus:border-sky-400/40 resize-none" />
            </div>
            <div>
              <label className="text-[10px] text-zinc-500 block mb-1">Project scope</label>
              <select value={form.project_id} onChange={e => setForm({ ...form, project_id: e.target.value })}
                className="w-full bg-black/30 border border-white/[0.08] text-zinc-300 text-[11px] rounded-md py-2 px-2.5 focus:outline-none focus:border-sky-400/40">
                <option value="">All projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-zinc-600 bg-black/20 border border-white/[0.05] rounded-md py-2 px-2.5">
              <ServerCog size={12} className={status?.available && status.running !== false ? 'text-emerald-400' : 'text-amber-400'} />
              {status?.available && status.running !== false
                ? `Scheduler live · ${status.jobs ?? 0} jobs`
                : 'Scheduler offline — runs after backend start'}
            </div>
          </div>

          {/* Flow */}
          <div className="space-y-2">
            {/* 1. Task type */}
            <div className={`rounded-xl border border-white/[0.08] border-l-4 ${meta.line} bg-[#101014] p-4 shadow-sm`}>
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-sky-500/15 text-sky-300 text-[11px] font-bold flex items-center justify-center shrink-0">1</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300">Task type</span>
                <span className="flex items-center gap-1 text-[10px] text-zinc-400 font-medium ml-1">
                  <span className={meta.glyph.split(' ')[0]}>{meta.icon}</span> {meta.label}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {Object.entries(TASK_META).map(([type, m]) => (
                  <button key={type} onClick={() => setForm({ ...form, task_type: type })}
                    className={`text-left rounded-lg border p-2.5 transition-all ${
                      form.task_type === type
                        ? 'border-sky-400/40 bg-sky-500/[0.07] ring-1 ring-sky-400/20'
                        : 'border-white/[0.06] hover:border-white/[0.12]'
                    }`}>
                    <div className="flex items-center gap-1.5">
                      <span className={m.glyph.split(' ')[0]}>{m.icon}</span>
                      <span className="text-[10px] font-semibold text-zinc-200">{m.label}</span>
                    </div>
                    <p className="text-[9px] text-zinc-500 leading-snug mt-1">
                      {type === 'email_digest' && 'Daily/weekly summary emails to the team'}
                      {type === 'health_check' && 'Probe service endpoints and record uptime'}
                      {type === 'alert_sync' && 'Pull fresh alerts from monitoring providers'}
                      {type === 'report' && 'Generate a deployment or incident report'}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* connector */}
            <div className="flex flex-col items-center py-1">
              <span className="w-7 h-7 rounded-full bg-white/[0.03] border border-dashed border-white/[0.15] flex items-center justify-center text-zinc-500">
                <ArrowDown size={13} />
              </span>
            </div>

            {/* 2. Schedule */}
            <div className="rounded-xl border border-white/[0.08] border-l-4 border-l-amber-400 bg-[#101014] p-4 shadow-sm">
              <div className="flex items-center gap-2.5">
                <span className="w-6 h-6 rounded-full bg-amber-500/15 text-amber-300 text-[11px] font-bold flex items-center justify-center shrink-0">2</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Schedule</span>
                <span className="text-[10px] text-zinc-500">recurring</span>
                <span className="ml-auto flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                  <Clock3 size={11} className="text-amber-300" /> next {nextCronRun(form.cron_expression || '0 0 * * *')}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {PRESET_CRONS.map(p => (
                  <button key={p.value} onClick={() => setForm({ ...form, cron_expression: p.value })}
                    className={`text-left rounded-lg border p-2 transition-all ${
                      form.cron_expression === p.value
                        ? 'border-sky-400/40 bg-sky-500/[0.07]'
                        : 'border-white/[0.06] hover:border-white/[0.12]'
                    }`}>
                    <p className="text-[10px] font-semibold text-zinc-200">{p.label}</p>
                    <p className="text-[9px] font-mono text-zinc-500 mt-0.5">{p.value}</p>
                    <p className="text-[8px] text-zinc-600 mt-0.5">{p.desc}</p>
                  </button>
                ))}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <span className="text-[10px] text-zinc-500 shrink-0">Custom cron</span>
                <input value={form.cron_expression} onChange={e => setForm({ ...form, cron_expression: e.target.value })}
                  placeholder="0 9 * * *"
                  className="flex-1 bg-black/30 border border-white/[0.08] text-zinc-100 placeholder-zinc-600 text-[11px] font-mono rounded-md py-1.5 px-2.5 focus:outline-none focus:border-amber-400/40" />
              </div>
            </div>

            {/* connector */}
            <div className="flex flex-col items-center py-1">
              <span className="w-7 h-7 rounded-full bg-white/[0.03] border border-dashed border-white/[0.15] flex items-center justify-center text-zinc-500">
                <ArrowDown size={13} />
              </span>
            </div>

            {/* 3. Configuration */}
            {(form.task_type === 'email_digest' || form.task_type === 'report') && (
              <div className="rounded-xl border border-white/[0.08] border-l-4 border-l-violet-400 bg-[#101014] p-4 shadow-sm">
                <div className="flex items-center gap-2.5">
                  <span className="w-6 h-6 rounded-full bg-violet-500/15 text-violet-300 text-[11px] font-bold flex items-center justify-center shrink-0">3</span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-violet-300">Configuration</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select value={(form.task_config.report_type as string) || 'daily'} onChange={e => setForm(
                    { ...form, task_config: { ...form.task_config, report_type: e.target.value } }
                  )} className="flex-1 min-w-[180px] bg-black/30 border border-white/[0.08] text-zinc-300 text-[11px] rounded-md py-1.5 px-2.5 focus:outline-none focus:border-violet-400/40">
                    <option value="daily">Daily summary</option>
                    <option value="weekly">Weekly summary</option>
                    <option value="deployment_summary">Deployment summary</option>
                    <option value="incident_summary">Incident summary</option>
                  </select>
                  <input value={(form.task_config.recipients as string) || ''} onChange={e => setForm(
                    { ...form, task_config: { ...form.task_config, recipients: e.target.value } }
                  )} placeholder="ops@company.com, dev@company.com"
                    className="flex-[2] min-w-[220px] bg-black/30 border border-white/[0.08] text-zinc-100 placeholder-zinc-600 text-[11px] rounded-md py-1.5 px-2.5 focus:outline-none focus:border-violet-400/40" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* ─────────────────────────── LIST / CATALOG ─────────────────────────── */
  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-10">
      {/* Jira-style page header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <CalendarClock size={15} className="text-sky-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white tracking-tight">Scheduled tasks</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">Recurring automations — drag to set run sequence</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-zinc-600 bg-white/[0.03] border border-white/[0.06] px-2 py-1 rounded">
            {stats.total} tasks · {stats.active} active
          </span>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-black hover:bg-zinc-200 text-xs font-semibold transition-all">
            <Plus size={13} /> Create task
          </button>
        </div>
      </div>

      {error && (
        <div className={`${
          error.startsWith('✓') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
        } border text-xs rounded-xl p-3.5 flex items-start gap-2.5`}>
          {error.startsWith('✓') ? <CheckCircle size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{error.replace(/^✓\s*/, '')}</span>
          <button onClick={() => setError('')} className="opacity-60 hover:opacity-100"><X size={13} /></button>
        </div>
      )}

      {/* Scheduler status chip row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-[11px] font-medium ${
          status?.available && status.running !== false
            ? 'bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-300'
            : 'bg-amber-500/[0.06] border-amber-500/20 text-amber-300'
        }`}>
          <ServerCog size={13} />
          {status === null ? 'Scheduler state unknown'
            : status.available && status.running !== false ? `Scheduler live · ${status.jobs ?? 0} jobs`
            : 'Scheduler offline'}
          {status?.available && status.running !== false && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-[220px] bg-white/[0.03] border border-white/[0.07] rounded-lg px-3 py-2">
          <Search size={13} className="text-zinc-500" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search scheduled tasks"
            className="flex-1 bg-transparent text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none" />
          {query && <button onClick={() => setQuery('')} className="text-zinc-600 hover:text-zinc-300"><X size={12} /></button>}
        </div>
        <select value={fType} onChange={e => setFType(e.target.value)}
          className="bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-[11px] rounded-lg py-2 px-2 focus:outline-none">
          <option value="all">All types</option>
          {Object.entries(TASK_META).map(([type, m]) => <option key={type} value={type}>{m.label}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          className="bg-white/[0.03] border border-white/[0.07] text-zinc-300 text-[11px] rounded-lg py-2 px-2 focus:outline-none">
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-zinc-500 py-10 justify-center">
          <Loader size={14} className="animate-spin" /> Loading tasks…
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white/[0.02] border border-dashed border-white/[0.1] rounded-2xl p-12 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-sky-500/10 to-violet-500/5 border border-white/10 flex items-center justify-center mb-3">
            <CalendarClock size={20} className="text-sky-300" />
          </div>
          <p className="text-sm text-slate-300 font-medium">Nothing scheduled yet</p>
          <p className="text-[11px] text-zinc-500 mt-1.5 max-w-sm mx-auto">
            Schedule a daily email digest, weekly deployment report, or recurring health check.
          </p>
          <button onClick={openCreate}
            className="mt-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1b6f93] hover:bg-[#208ab8] text-white text-xs font-bold transition-all">
            <Plus size={13} /> Schedule your first task
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white/[0.02] border border-dashed border-white/[0.08] rounded-xl p-8 text-center text-xs text-zinc-500">
          <SlidersHorizontal size={16} className="text-zinc-600 mx-auto mb-2" />
          No tasks match your search or filters.
        </div>
      ) : (
        <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                <th className="py-3 px-2 w-6"><GripVertical size={12} className="text-zinc-700" /></th>
                <th className="py-3 px-3">Task</th>
                <th className="py-3 px-3 hidden md:table-cell">Schedule</th>
                <th className="py-3 px-3 hidden sm:table-cell">Next run</th>
                <th className="py-3 px-3 text-right">Run now</th>
                <th className="py-3 px-4 text-right w-32">Status</th>
                <th className="py-3 px-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {filtered.map((task, index) => {
                const meta = TASK_META[task.task_type] || TASK_META.report;
                const dragging = reorder.isDragging(index);
                const dropTarget = reorder.isDropTarget(index);
                return (
                  <tr key={task.id}
                    onDragOver={e => reorder.onDragOver(e, index)}
                    onDragEnter={e => reorder.onDragEnter(e, index)}
                    onDrop={e => reorder.onDrop(e, index)}
                    draggable
                    onDragStart={e => reorder.onDragStart(e, index, task.id)}
                    onDragEnd={reorder.onDragEnd}
                    onClick={() => openEdit(task)}
                    className={`group cursor-pointer transition-colors ${dragging ? 'opacity-40 bg-sky-500/[0.04]' : 'hover:bg-white/[0.03]'} ${!task.enabled ? 'opacity-60' : ''} ${dropTarget ? 'ring-2 ring-inset ring-sky-400/50' : ''}`}>
                    <td className="py-3.5 px-2 w-6 cursor-grab active:cursor-grabbing text-zinc-700 group-hover:text-zinc-400" onClick={e => e.stopPropagation()}>
                      <GripVertical size={13} />
                    </td>
                    <td className="py-3.5 px-3">
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${meta.glyph}`}>{meta.icon}</span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-100 truncate flex items-center gap-1.5">
                            <span className="text-[10px] font-mono text-zinc-500">{task.id.slice(0,6).toUpperCase()}</span>
                            {task.name}
                          </p>
                          <p className="text-[10px] text-zinc-500 truncate mt-0.5">
                            <Tag size={9} className="inline text-zinc-600 mr-0.5" />
                            {meta.label}
                            {task.last_run_at && (
                              <>
                                <span className="text-zinc-700 mx-1">·</span>last run {timeAgo(task.last_run_at)}
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-3 hidden md:table-cell">
                      <span className="text-[10px] font-mono text-zinc-300 bg-white/[0.04] border border-white/[0.08] px-2 py-1 rounded-full">
                        {task.cron_expression}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 hidden sm:table-cell text-[10px] text-zinc-500 font-mono">
                      {nextCronRun(task.cron_expression)}
                    </td>
                    <td className="py-3.5 px-3 text-right" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleRunNow(task)} disabled={busyId === task.id}
                        className="inline-flex items-center gap-1 text-[10px] font-mono text-zinc-300 border border-white/[0.08] hover:border-emerald-400/40 hover:text-emerald-300 bg-white/[0.03] px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-50">
                        {busyId === task.id ? <Loader size={11} className="animate-spin" /> : <Play size={11} />}
                        RUN
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleToggle(task)}
                        title={task.enabled ? 'Pause' : 'Activate'}
                        className={`relative w-10 h-[22px] rounded-full transition-colors border ${
                          task.enabled ? 'bg-[#208ab8] border-sky-400/40' : 'bg-zinc-700/60 border-white/[0.1]'
                        }`}>
                        <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-all ${task.enabled ? 'left-[22px]' : 'left-[3px]'}`} />
                      </button>
                    </td>
                    <td className="py-3.5 px-3 w-10 text-right" onClick={e => e.stopPropagation()}>
                      <button onClick={() => handleDelete(task)}
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

      {/* Footer note */}
      <div className="flex items-center gap-1.5 text-[10px] text-zinc-600">
        <History size={11} />
        Tasks run inside the FastAPI process via APScheduler. Restart the backend to reload schedules.
      </div>

      {user && <div className="h-2" />}
    </div>
  );
};