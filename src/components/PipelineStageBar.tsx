import React from 'react';
import { Check, GitBranch, Loader2, X } from 'lucide-react';
import type { Deployment } from '../types/platform';

type StageStatus = 'success' | 'failed' | 'running' | 'pending';

const STAGE_BOX: Record<StageStatus, string> = {
  success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
  failed: 'bg-red-500/10 border-red-500/30 text-red-400',
  running: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  pending: 'bg-white/[0.02] border-white/[0.06] text-zinc-500',
};

function stageBoxIcon(status: StageStatus, size = 10) {
  if (status === 'success') return <Check size={size} />;
  if (status === 'failed') return <X size={size} />;
  if (status === 'running') return <Loader2 size={size} className="animate-spin" />;
  return <span className="w-[6px] h-[6px] rounded-full border border-zinc-600" />;
}

function fmtStageDur(ms?: number): string {
  if (!ms || ms <= 0) return '';
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

/**
 * Jenkins Blue-Ocean style stage pipeline: commit → build → test → deploy.
 * Renders a connected row of status-colored stage boxes starting with the
 * commit hash chip. Falls back to the canonical 4-stage pipeline when a
 * deployment has no explicit stage list.
 */
export const PipelineStageBar: React.FC<{
  stages?: Deployment['stages'];
  deploymentStatus?: string;
  commitHash?: string;
  commitMessage?: string;
}> = ({ stages, deploymentStatus = '', commitHash, commitMessage }) => {
  const list: { name: string; status: StageStatus; durationMs?: number }[] =
    stages && stages.length > 0
      ? stages.map(s => ({ name: s.name, status: s.status, durationMs: s.durationMs }))
      : (
          [
            { name: 'Commit', status: 'success' as StageStatus },
            { name: 'Build', status: 'pending' as StageStatus },
            { name: 'Test', status: 'pending' as StageStatus },
            { name: 'Security', status: 'pending' as StageStatus },
            { name: 'Deploy', status: 'pending' as StageStatus },
          ]
        ).map((s, i) => ({
          ...s,
          status:
            deploymentStatus === 'ready' || deploymentStatus === 'rolled_back'
              ? 'success'
              : i === 0
                ? 'success'
                : deploymentStatus === 'failed'
                  ? (i === 1 ? 'success' : i === 2 ? 'failed' : 'pending')
                  : deploymentStatus === 'building'
                    ? (i === 1 ? 'success' : i === 2 ? 'running' : 'pending')
                    : 'pending',
        }));

  return (
    <div className="flex items-center gap-1">
      {commitHash && (
        <div
          className="flex items-center gap-1 px-1.5 py-1 rounded-lg border border-white/[0.06] bg-white/[0.02] text-zinc-400 shrink-0"
          title={commitMessage || commitHash}
        >
          <GitBranch size={10} />
          <span className="text-[8px] font-bold font-mono uppercase">{commitHash.slice(0, 7)}</span>
        </div>
      )}
      {list.map((stage, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className="w-3 border-t border-white/[0.08]" />
          <div
            className={`flex items-center gap-1 px-1.5 py-1 rounded-lg border shrink-0 ${STAGE_BOX[stage.status]}`}
            title={`${stage.name}${fmtStageDur(stage.durationMs) ? ` · ${fmtStageDur(stage.durationMs)}` : ''}`}
          >
            {stageBoxIcon(stage.status)}
            <span className="text-[8px] font-bold uppercase tracking-wide max-w-[76px] truncate whitespace-nowrap">
              {stage.name}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PipelineStageBar;