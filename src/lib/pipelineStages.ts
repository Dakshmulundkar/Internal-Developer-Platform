import type { Deployment } from '../types/platform';

export type DeployStage = NonNullable<Deployment['stages']>[number];

export interface NormalizedStage {
  name: string;
  status: string;
  durationMs: number;
}

const VALID_STATUSES = ['pending', 'running', 'success', 'failed'] as const;

function toStage(s: unknown): NormalizedStage | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as { name?: unknown; status?: unknown; durationMs?: unknown };
  if (typeof o.name !== 'string') return null;
  const st = String(o.status);
  return {
    name: String(o.name),
    status: VALID_STATUSES.includes(st as (typeof VALID_STATUSES)[number]) ? st : 'pending',
    durationMs: Number(o.durationMs) || 0,
  };
}

/** Parse stages from array, JSON string, or anything else. Never throws. */
export function normalizeStages(stages: unknown): NormalizedStage[] {
  let arr: unknown = stages;
  if (typeof arr === 'string') {
    try {
      arr = JSON.parse(arr);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: NormalizedStage[] = [];
  for (const s of arr) {
    const stage = toStage(s);
    if (stage) out.push(stage);
  }
  return out;
}

/**
 * Failure gate: once a stage is failed/running, everything after it is
 * 'not run' (pending). Earlier successes are preserved untouched.
 */
export function gateStages(items: { name: string; status: string }[]): { name: string; status: string }[] {
  const out: { name: string; status: string }[] = [];
  let blocked = false;
  for (const s of items) {
    if (blocked) {
      out.push({ name: s.name, status: 'pending' });
    } else {
      out.push({ name: s.name, status: s.status });
      if (s.status === 'failed' || s.status === 'running') blocked = true;
    }
  }
  return out;
}

/** Resolve a circle's display status, with the no-provider deploy override. */
export function resolveStageStatus(
  key: string,
  statusMap: Map<string, string>,
  deployPending: boolean,
): string {
  if (key === 'Deploy' && deployPending) return 'pending';
  return statusMap.get(key.toLowerCase()) || 'pending';
}
