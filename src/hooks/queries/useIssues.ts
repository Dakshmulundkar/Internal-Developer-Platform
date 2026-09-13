/**
 * useIssues — TanStack Query hook for the Jira-style Issues domain.
 *
 * Provides:
 *  - useIssues(projectId)         → fetch + cache list
 *  - useIssue(issueId)            → single issue detail
 *  - useUpdateIssueStatus()       → mutation WITH optimistic update (drag-to-column)
 *  - useCreateIssue()             → mutation with cache append
 *  - useDeleteIssue()             → mutation with cache removal
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';

import { issuesApi } from '../../services/issuesApi';
import { issueKeys } from '../../lib/queryKeys';
import type { Issue, CreateIssuePayload, UpdateIssueStatusPayload } from '../../types/issues';

// ─────────────────────────────────────────────────────────────────────────────
// Read hooks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch and subscribe to all issues for a project.
 * Pass `select` to derive a subset (e.g. only 'in_progress') without
 * triggering re-renders for unrelated changes.
 */
export function useIssues(
  projectId: string,
  options?: Omit<UseQueryOptions<Issue[], Error, Issue[]>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<Issue[], Error>({
    queryKey: issueKeys.byProject(projectId),
    queryFn: () => issuesApi.listByProject(projectId),
    // Kanban boards feel stale quickly — refresh every 60 s
    staleTime: 60_000,
    ...options,
  });
}

/** Fetch a single issue. Seeded from the list cache so no extra request if
 *  the list was already fetched. */
export function useIssue(issueId: string) {
  const queryClient = useQueryClient();

  return useQuery<Issue, Error>({
    queryKey: issueKeys.detail(issueId),
    queryFn: () => issuesApi.get(issueId),
    // Pre-populate from any project list already in cache
    initialData: () => {
      const allCached = queryClient.getQueriesData<Issue[]>({ queryKey: issueKeys.all() });
      for (const [, issues] of allCached) {
        const found = issues?.find((i) => i.id === issueId);
        if (found) return found;
      }
      return undefined;
    },
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(issueKeys.all())?.dataUpdatedAt,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: update status (Kanban drag-and-drop)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * useUpdateIssueStatus
 *
 * Implements a full optimistic update pattern:
 *  1. On mutate  → snapshot existing list, apply change immediately in cache
 *  2. On error   → roll back to snapshot
 *  3. On settle  → re-validate to ensure server state wins
 *
 * Usage:
 *   const { mutate } = useUpdateIssueStatus(projectId);
 *   mutate({ id: issue.id, status: 'in_progress' });
 */
export function useUpdateIssueStatus(projectId: string) {
  const queryClient = useQueryClient();
  const listKey = issueKeys.byProject(projectId);

  return useMutation<Issue, Error, UpdateIssueStatusPayload, { previousIssues: Issue[] | undefined }>({
    mutationFn: issuesApi.updateStatus,

    // ── Step 1: Optimistic update ──────────────────────────────────────────
    onMutate: async (payload) => {
      // Cancel any in-flight refetches so they don't clobber our optimistic write
      await queryClient.cancelQueries({ queryKey: listKey });

      // Snapshot the previous value for rollback
      const previousIssues = queryClient.getQueryData<Issue[]>(listKey);

      // Optimistically update the list cache
      queryClient.setQueryData<Issue[]>(listKey, (old = []) =>
        old.map((issue) =>
          issue.id === payload.id
            ? { ...issue, status: payload.status, updatedAt: new Date().toISOString() }
            : issue,
        ),
      );

      // Also update the detail cache if it's loaded
      queryClient.setQueryData<Issue>(issueKeys.detail(payload.id), (old) =>
        old ? { ...old, status: payload.status, updatedAt: new Date().toISOString() } : old,
      );

      // Return context for potential rollback
      return { previousIssues };
    },

    // ── Step 2: Rollback on server error ──────────────────────────────────
    onError: (_error, payload, context) => {
      if (context?.previousIssues !== undefined) {
        queryClient.setQueryData<Issue[]>(listKey, context.previousIssues);
      }
      // Also invalidate detail to ensure consistency
      queryClient.invalidateQueries({ queryKey: issueKeys.detail(payload.id) });
    },

    // ── Step 3: Always re-validate after the mutation settles ─────────────
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: create issue
// ─────────────────────────────────────────────────────────────────────────────

export function useCreateIssue(projectId: string) {
  const queryClient = useQueryClient();
  const listKey = issueKeys.byProject(projectId);

  return useMutation<Issue, Error, CreateIssuePayload>({
    mutationFn: issuesApi.create,

    onSuccess: (newIssue) => {
      // Append to the cached list without a full refetch
      queryClient.setQueryData<Issue[]>(listKey, (old = []) => [...old, newIssue]);
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutation: delete issue
// ─────────────────────────────────────────────────────────────────────────────

export function useDeleteIssue(projectId: string) {
  const queryClient = useQueryClient();
  const listKey = issueKeys.byProject(projectId);

  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: issuesApi.delete,

    onSuccess: (_result, deletedId) => {
      queryClient.setQueryData<Issue[]>(listKey, (old = []) =>
        old.filter((issue) => issue.id !== deletedId),
      );
      queryClient.removeQueries({ queryKey: issueKeys.detail(deletedId) });
    },
  });
}
