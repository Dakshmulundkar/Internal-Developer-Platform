/**
 * Centralized query key factory.
 *
 * Rules:
 *  - Every domain owns a root key (e.g. `issues`).
 *  - Leaf keys include parameters so that invalidation is surgical:
 *      queryClient.invalidateQueries({ queryKey: issueKeys.byProject('proj-1') })
 *  - Keys are `as const` tuples so TypeScript can narrow them exactly.
 */

export const issueKeys = {
  all:          () => ['issues'] as const,
  byProject:    (projectId: string) => ['issues', projectId] as const,
  detail:       (issueId: string)   => ['issues', 'detail', issueId] as const,
} as const;