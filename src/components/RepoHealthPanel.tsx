import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle, ExternalLink, FileCode2, GitPullRequest, Info,
  Loader2, ShieldCheck, Sparkles, Ticket, Wrench, XCircle,
} from 'lucide-react';
import { usePlatform } from '../context/PlatformContext';
import {
  api, isApiAvailable,
  type AutofixFinding, type AutofixRun, type AutofixScanResult,
  type AutofixTicket,
} from '../services/api';

const BASE_APPLY_STEPS = [
  'Cloning repository…',
  'Detecting stack & generating fixes…',
  'Running linters…',
];

function FindingIcon({ finding }: { finding: AutofixFinding }) {
  if (finding.type === 'missing_dockerfile') {
    return <FileCode2 size={14} className="text-cyan-400 shrink-0 mt-0.5" />;
  }
  if (finding.type === 'lint') {
    return finding.fixable
      ? <Wrench size={14} className="text-amber-400 shrink-0 mt-0.5" />
      : <Info size={14} className="text-zinc-500 shrink-0 mt-0.5" />;
  }
  return <Info size={14} className="text-zinc-500 shrink-0 mt-0.5" />;
}

function FileBadge({ automation }: { automation: string }) {
  if (automation === 'ai') {
    return <span className="ml-2 text-[10px] font-mono text-violet-300 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded">✨ AI FIX</span>;
  }
  if (automation === 'triage') {
    return <span className="ml-2 text-[10px] font-mono text-orange-300 bg-orange-500/10 border border-orange-500/20 px-1.5 py-0.5 rounded">🎫 TICKET</span>;
  }
  return null;
}

function RunBadge({ status }: { status: string }) {
  if (status === 'pr_opened') {
    return <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">PR OPENED</span>;
  }
  if (status === 'no_changes') {
    return <span className="text-[10px] font-mono font-bold text-zinc-400 bg-white/5 border border-white/[0.08] px-2 py-0.5 rounded">NO CHANGES</span>;
  }
  return <span className="text-[10px] font-mono font-bold text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded">FAILED</span>;
}

interface ApplyOutcome {
  branch?: string;
  prUrl?: string;
  files?: string[];
  noChanges?: boolean;
  message?: string;
  tickets: AutofixTicket[];
  aiFixed: string[];
  aiNotes: string[];
}

/**
 * Repo Health panel — lives inside the ProjectDetails Infrastructure tab
 * (Phase 8, Task 83). Scan is a dry-run; Apply runs in one go:
 * Dockerfile template + linter --fix + OpenAI small fixes (opt-in),
 * pushes to a fresh `aether/autofix-*` branch, opens a PR, and files
 * triage tickets for problems too large to automate — never to the
 * default branch.
 */
export const RepoHealthPanel: React.FC<{ projectId: string }> = ({ projectId }) => {
  const { navigateTo } = usePlatform();
  const [scan, setScan] = useState<AutofixScanResult | null>(null);
  const [runs, setRuns] = useState<AutofixRun[]>([]);
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [useAi, setUseAi] = useState(true);
  const [applySteps, setApplySteps] = useState<string[]>(BASE_APPLY_STEPS);
  const [applyStep, setApplyStep] = useState(0);
  const [applyResult, setApplyResult] = useState<ApplyOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRuns = useCallback(async () => {
    if (!isApiAvailable()) return;
    try {
      const res = await api.autofix.runs(projectId);
      setRuns(res.runs);
    } catch {
      // history is best-effort; the panel still works without it
    }
  }, [projectId]);

  useEffect(() => {
    loadRuns();
    return () => {
      if (stepTimer.current) clearInterval(stepTimer.current);
    };
  }, [loadRuns]);

  if (!isApiAvailable()) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <ShieldCheck size={15} className="text-cyan-400" />
          <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">Repo Health</h4>
        </div>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          Available in API mode — connect a backend and link a GitHub repository
          to scan for missing Dockerfiles and auto-fixable lint issues.
        </p>
      </div>
    );
  }

  const aiFiles = (scan?.findings || []).flatMap(f => (f.files || []).filter(d => d.automation === 'ai'));
  const triageFiles = (scan?.findings || []).flatMap(f => (f.files || []).filter(d => d.automation === 'triage'));

  const doScan = async () => {
    setScanning(true);
    setError(null);
    setScan(null);
    setApplyResult(null);
    try {
      const res = await api.autofix.scan(projectId);
      setScan(res);
      setUseAi(res.ai_available);
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed.');
    } finally {
      setScanning(false);
    }
  };

  const doApply = async () => {
    if (!scan?.apply_enabled) return;
    const steps = [...BASE_APPLY_STEPS];
    if (useAi && scan.ai_available && aiFiles.length > 0) {
      steps.push(`AI-fixing ${aiFiles.length} small file(s) with OpenAI…`);
    }
    if (triageFiles.length > 0) {
      steps.push(`Creating ${triageFiles.length} triage ticket(s)…`);
    }
    steps.push('Pushing fix branch…', 'Opening pull request…');
    setApplySteps(steps);
    setApplying(true);
    setApplyStep(0);
    setError(null);
    setApplyResult(null);
    stepTimer.current = setInterval(() => {
      setApplyStep(s => (s + 1 < steps.length ? s + 1 : s));
    }, 4000);
    try {
      const res = await api.autofix.apply(projectId, useAi && scan.ai_available);
      if (res.status === 'no_changes') {
        setApplyResult({
          noChanges: true, message: res.message,
          tickets: res.tickets || [], aiFixed: [], aiNotes: res.ai_notes || [],
        });
      } else {
        setApplyResult({
          branch: res.branch || '', prUrl: res.pr_url || '', files: res.files || [],
          tickets: res.tickets || [], aiFixed: res.ai_fixed || [], aiNotes: res.ai_notes || [],
        });
      }
      await loadRuns();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apply failed.');
    } finally {
      if (stepTimer.current) clearInterval(stepTimer.current);
      setApplying(false);
    }
  };

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck size={15} className="text-cyan-400" /> Repo Health
          {scan && (
            <span className="ml-1 text-[10px] font-mono bg-white/5 text-zinc-400 border border-white/[0.06] px-1.5 py-0.5 rounded normal-case">
              {scan.repo} · {scan.stack} · {scan.clone_mb} MB
            </span>
          )}
        </h4>
        <button onClick={doScan} disabled={scanning || applying}
          className="bg-white text-black hover:bg-zinc-200 font-medium py-1.5 px-3 rounded text-xs flex items-center gap-1.5 transition-all disabled:opacity-50">
          {(scanning) && <Loader2 size={12} className="animate-spin" />}
          {scanning ? 'Scanning…' : 'Scan repository'}
        </button>
      </div>

      {error && (
        <p className="text-[11px] text-rose-300 flex items-center gap-2">
          <XCircle size={13} className="shrink-0" /> {error}
        </p>
      )}

      {scan && (
        <div className="space-y-3">
          <div className="space-y-2">
            {scan.findings.length === 0 && (
              <p className="text-[11px] text-zinc-500">No findings — the repo looks healthy.</p>
            )}
            {scan.findings.map((f, i) => (
              <div key={i} className="p-3 bg-white/[0.02] rounded-lg border border-white/[0.06] space-y-2">
                <div className="flex gap-2.5">
                  <FindingIcon finding={f} />
                  <div>
                    <div className="text-[11px] font-semibold text-zinc-200">
                      {f.type === 'missing_dockerfile' ? 'Dockerfile missing' : `Lint · ${f.tool}`}
                      {f.fixable && (
                        <span className="ml-2 text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">AUTO-FIXABLE</span>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">{f.detail}</div>
                  </div>
                </div>
                {(f.files || []).length > 0 && (
                  <div className="ml-6 space-y-1.5 pt-1 border-t border-white/[0.04]">
                    {f.files!.map(d => (
                      <div key={d.file} className="text-[11px]">
                        <span className="font-mono text-zinc-300">{d.file}</span>
                        <span className="text-zinc-600 font-mono"> · {d.errors} error{d.errors === 1 ? '' : 's'}</span>
                        <FileBadge automation={d.automation} />
                        {(d.cause || d.reason) && (
                          <div className="text-zinc-500 mt-0.5">
                            {d.cause}{d.reason ? ` — ${d.reason}` : ''}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {aiFiles.length > 0 && (
            scan.ai_available ? (
              <label className="flex items-start gap-2.5 cursor-pointer p-3 bg-violet-500/[0.05] rounded-lg border border-violet-500/20">
                <input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)}
                  className="w-4 h-4 mt-0.5 bg-black/30 border-white/[0.06] rounded" />
                <span className="text-[11px] text-zinc-300 flex items-center gap-1.5 flex-wrap">
                  <Sparkles size={12} className="text-violet-300" />
                  Also fix {aiFiles.length} small file{aiFiles.length === 1 ? '' : 's'} with OpenAI
                  <span className="text-zinc-500">(only those files leave this server; each fix is re-linted before use)</span>
                </span>
              </label>
            ) : (
              <p className="text-[11px] text-zinc-500 p-3 bg-white/[0.02] rounded-lg border border-white/[0.06]">
                {aiFiles.length} small file{aiFiles.length === 1 ? ' is' : 's are'} AI-eligible, but no OpenAI key is
                configured — set <span className="font-mono text-zinc-300">OPENAI_API_KEY</span> in{' '}
                <span className="font-mono text-zinc-300">backend/.env</span> and restart the backend to enable AI fixes.
                Mechanical fixes below still work.
              </p>
            )
          )}

          <div>
            <button onClick={doApply} disabled={!scan.apply_enabled || applying || scanning}
              title={scan.apply_enabled ? 'Fix, push to a new branch, open a PR, and ticket large problems' : (scan.apply_blocked_reason || 'Apply unavailable')}
              className="bg-emerald-500 text-black hover:bg-emerald-400 font-medium py-2 px-4 rounded-lg text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
              {applying && <Loader2 size={12} className="animate-spin" />}
              <GitPullRequest size={13} /> Apply fixes &amp; open PR
            </button>
            {!scan.apply_enabled && scan.apply_blocked_reason && (
              <p className="text-[11px] text-zinc-500 mt-1.5">{scan.apply_blocked_reason}</p>
            )}
            {triageFiles.length > 0 && scan.apply_enabled && (
              <p className="text-[11px] text-zinc-500 mt-1.5">
                Large problems ({triageFiles.length} file{triageFiles.length === 1 ? '' : 's'}) won't be auto-fixed —
                triage tickets will be opened on the Incidents page instead.
              </p>
            )}
          </div>
        </div>
      )}

      {applying && (
        <div className="p-3 bg-white/[0.02] rounded-lg border border-white/[0.06] space-y-1.5">
          {applySteps.map((label, i) => (
            <div key={label} className={`text-[11px] flex items-center gap-2 ${i < applyStep ? 'text-zinc-600' : i === applyStep ? 'text-zinc-200 font-semibold' : 'text-zinc-700'}`}>
              {i < applyStep
                ? <CheckCircle size={12} className="text-emerald-500" />
                : i === applyStep
                  ? <Loader2 size={12} className="animate-spin text-cyan-400" />
                  : <span className="w-3 h-3 rounded-full border border-zinc-700 inline-block" />}
              {label}
            </div>
          ))}
          <p className="text-[10px] text-zinc-600 pt-1">First run can take a few minutes (dependency install + AI fixes). Fixes go to a new branch — your default branch is never touched.</p>
        </div>
      )}

      {applyResult && !applyResult.noChanges && (
        <div className="p-4 bg-emerald-500/[0.06] rounded-xl border border-emerald-500/20 space-y-2">
          <p className="text-xs font-semibold text-emerald-300 flex items-center gap-2">
            <CheckCircle size={14} /> Pull request opened
          </p>
          <p className="text-[11px] text-zinc-400 font-mono">{applyResult.branch}</p>
          {applyResult.prUrl && (
            <a href={applyResult.prUrl} target="_blank" rel="noreferrer"
              className="text-[11px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1.5">
              <ExternalLink size={12} /> {applyResult.prUrl}
            </a>
          )}
          <p className="text-[11px] text-zinc-500">Files changed: {(applyResult.files || []).join(', ') || '—'}</p>
          {(applyResult.aiFixed || []).length > 0 && (
            <p className="text-[11px] text-violet-300 flex items-center gap-1.5">
              <Sparkles size={12} /> AI-assisted: {(applyResult.aiFixed || []).join(', ')} — please review these carefully
            </p>
          )}
        </div>
      )}

      {applyResult && applyResult.noChanges && (
        <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06]">
          <p className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
            <CheckCircle size={14} className="text-emerald-400" /> {applyResult.message || 'Nothing to fix — repo is already healthy.'}
          </p>
        </div>
      )}

      {applyResult && (applyResult.aiNotes || []).length > 0 && (
        <div className="space-y-1">
          {(applyResult.aiNotes || []).map((note, i) => (
            <p key={i} className="text-[11px] text-zinc-500">• {note}</p>
          ))}
        </div>
      )}

      {applyResult && applyResult.tickets.length > 0 && (
        <div className="p-4 bg-orange-500/[0.05] rounded-xl border border-orange-500/20 space-y-2">
          <p className="text-xs font-semibold text-orange-300 flex items-center gap-2">
            <Ticket size={14} /> {applyResult.tickets.length} triage ticket{applyResult.tickets.length === 1 ? '' : 's'} opened
          </p>
          {applyResult.tickets.map(t => (
            <button key={t.id} onClick={() => navigateTo('incidents')}
              className="block text-left text-[11px] text-zinc-300 hover:text-zinc-100 transition-colors">
              → {t.title}
            </button>
          ))}
          <p className="text-[10px] text-zinc-600">Too large to auto-fix — find them on the Incidents page.</p>
        </div>
      )}

      {runs.length > 0 && (
        <div className="pt-1">
          <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">Recent runs</p>
          <div className="space-y-1.5">
            {runs.map(r => (
              <div key={r.id} className="flex items-center justify-between gap-3 p-2.5 bg-white/[0.02] rounded-lg border border-white/[0.06]">
                <div className="flex items-center gap-2 min-w-0">
                  <RunBadge status={r.status} />
                  <span className="text-[11px] text-zinc-500 font-mono truncate">{r.branch || '—'}</span>
                </div>
                {r.pr_url && (
                  <a href={r.pr_url} target="_blank" rel="noreferrer"
                    className="text-[11px] text-cyan-300 hover:text-cyan-200 flex items-center gap-1 shrink-0">
                    <ExternalLink size={11} /> PR
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
