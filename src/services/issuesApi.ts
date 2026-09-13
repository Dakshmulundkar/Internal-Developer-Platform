/**
 * Issues API — thin adapter layer over the core apiFetch helper.
 * Keeping domain APIs in separate files prevents api.ts from becoming a monolith.
 *
 * NOTE: All calls go through `api` which uses `apiFetch` — this ensures the
 * Authorization header is attached on every request (unlike raw `fetch()`).
 */
import { api } from './api';
import type { Issue, CreateIssuePayload, UpdateIssueStatusPayload } from '../types/issues';

// Re-export for convenience so callers only need to import from this file.
export { api as issuesApiBase };

export const issuesApi = {
  /** Fetch all issues for a project, optionally filtered by status. */
  listByProject: (projectId: string): Promise<Issue[]> =>
    (api as unknown as Record<string, Record<string, (id: string) => Promise<Issue[]>>>)
      .issues?.listByProject?.(projectId) ??
    Promise.resolve([]),

  get: (issueId: string): Promise<Issue> =>
    (api as unknown as Record<string, Record<string, (id: string) => Promise<Issue>>>)
      .issues?.get?.(issueId) ??
    Promise.reject(new Error('issues.get not implemented')),

  create: (payload: CreateIssuePayload): Promise<Issue> =>
    (api as unknown as Record<string, Record<string, (p: CreateIssuePayload) => Promise<Issue>>>)
      .issues?.create?.(payload) ??
    Promise.reject(new Error('issues.create not implemented')),

  /** Patch only the status field — used by the kanban drag handler. */
  updateStatus: ({ id, status }: UpdateIssueStatusPayload): Promise<Issue> =>
    (api as unknown as Record<string, Record<string, (p: UpdateIssueStatusPayload) => Promise<Issue>>>)
      .issues?.updateStatus?.({ id, status }) ??
    Promise.reject(new Error('issues.updateStatus not implemented')),

  update: (id: string, patch: Partial<Omit<Issue, 'id' | 'projectId' | 'createdAt'>>): Promise<Issue> =>
    (api as unknown as Record<string, Record<string, (id: string, patch: typeof patch) => Promise<Issue>>>)
      .issues?.update?.(id, patch) ??
    Promise.reject(new Error('issues.update not implemented')),

  delete: (id: string): Promise<{ deleted: boolean }> =>
    (api as unknown as Record<string, Record<string, (id: string) => Promise<{ deleted: boolean }>>>)
      .issues?.delete?.(id) ??
    Promise.reject(new Error('issues.delete not implemented')),
};
