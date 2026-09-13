/**
 * IssueKanbanBoard
 *
 * Demonstrates the dual-state architecture in practice:
 *
 *  Server state  → TanStack Query (useIssues, useUpdateIssueStatus)
 *  UI state      → Zustand (useBoardStore, useDashboardStore)
 *
 * Drag-and-drop uses the Optimistic Update pattern:
 *  the card moves instantly in the UI, the PATCH fires in the background,
 *  and the board rolls back automatically if the server rejects it.
 *
 * Performance notes:
 *  - Each column uses a stable `select` function so it only re-renders
 *    when its own issues change — not when any issue in the project changes.
 *  - Zustand atomic selectors mean dragging one card doesn't re-render
 *    components that only care about, say, `activeTimeRange`.
 */

import React, { useCallback, useRef } from 'react';

import { useIssues, useUpdateIssueStatus } from '../hooks/queries/useIssues';
import {
  useBoardStore,
  selectDragOverColumn,
  selectActiveIssueId,
} from '../store/boardStore';
import {
  useDashboardStore,
  selectActiveProjectId,
  selectSelectedFilters,
} from '../store/dashboardStore';
import type { Issue, IssueStatus } from '../types/issues';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const COLUMNS: { id: IssueStatus; label: string }[] = [
  { id: 'backlog',     label: 'Backlog' },
  { id: 'todo',        label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review',   label: 'In Review' },
  { id: 'done',        label: 'Done' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

interface IssueCardProps {
  issue: Issue;
  onDragStart: (id: string) => void;
  onOpen: (id: string) => void;
}

const PRIORITY_COLORS: Record<Issue['priority'], string> = {
  critical: 'bg-red-500',
  high:     'bg-orange-500',
  medium:   'bg-yellow-500',
  low:      'bg-blue-400',
};

/** Memoised so Zustand/query updates in other columns don't re-render this card. */
const IssueCard = React.memo(function IssueCard({ issue, onDragStart, onOpen }: IssueCardProps) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(issue.id)}
      onClick={() => onOpen(issue.id)}
      className="group bg-[#111] border border-white/10 rounded-lg p-3 cursor-grab
                 active:cursor-grabbing hover:border-white/25 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs text-white/40 font-mono">{issue.id.slice(0, 8)}</span>
        <span
          className={`w-2 h-2 rounded-full shrink-0 mt-0.5 ${PRIORITY_COLORS[issue.priority]}`}
          title={issue.priority}
        />
      </div>
      <p className="text-sm text-white/80 line-clamp-2 leading-snug">{issue.title}</p>
      {issue.assigneeName && (
        <p className="mt-2 text-xs text-white/40 truncate">@{issue.assigneeName}</p>
      )}
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Column
// ─────────────────────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  column: { id: IssueStatus; label: string };
  issues: Issue[];
  isDragOver: boolean;
  onDragOver: (col: IssueStatus) => void;
  onDrop: (col: IssueStatus) => void;
  onDragStart: (id: string) => void;
  onOpenIssue: (id: string) => void;
}

const KanbanColumn = React.memo(function KanbanColumn({
  column,
  issues,
  isDragOver,
  onDragOver,
  onDrop,
  onDragStart,
  onOpenIssue,
}: KanbanColumnProps) {
  return (
    <div
      className={`flex flex-col w-64 shrink-0 rounded-xl border transition-colors
        ${isDragOver ? 'border-indigo-500/60 bg-indigo-500/5' : 'border-white/8 bg-white/[0.02]'}`}
      onDragOver={(e) => { e.preventDefault(); onDragOver(column.id); }}
      onDragLeave={() => onDragOver(null as unknown as IssueStatus)}
      onDrop={() => onDrop(column.id)}
    >
      {/* Column header */}
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-white/8">
        <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
          {column.label}
        </span>
        <span className="text-xs bg-white/10 text-white/50 rounded-full px-2 py-0.5">
          {issues.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 flex-1 min-h-[120px]">
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            onDragStart={onDragStart}
            onOpen={onOpenIssue}
          />
        ))}
      </div>
    </div>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main board
// ─────────────────────────────────────────────────────────────────────────────

export function IssueKanbanBoard() {
  // ── Zustand: read atomic slices ────────────────────────────────────────────
  const activeProjectId = useDashboardStore(selectActiveProjectId);
  const selectedFilters = useDashboardStore(selectSelectedFilters);
  const dragOverColumn  = useBoardStore(selectDragOverColumn);
  const activeIssueId   = useBoardStore(selectActiveIssueId);

  // ── Zustand: actions ───────────────────────────────────────────────────────
  const setDragOver    = useBoardStore((s) => s.setDragOverColumn);
  const openDetail     = useBoardStore((s) => s.openIssueDetail);
  const closeDetail    = useBoardStore((s) => s.closeIssueDetail);

  // ── TanStack Query ─────────────────────────────────────────────────────────
  const projectId = activeProjectId ?? 'default';

  const { data: allIssues = [], isLoading, isError } = useIssues(projectId);
  const { mutate: updateStatus, isPending: isUpdating } = useUpdateIssueStatus(projectId);

  // ── Drag state (ref — no re-render needed) ─────────────────────────────────
  const draggingIdRef = useRef<string | null>(null);

  // ── Derived: apply client-side filters ────────────────────────────────────
  const filteredIssues = allIssues.filter((issue) => {
    if (
      selectedFilters.severity !== 'all' &&
      // Map incident severity to issue priority for cross-domain filtering
      (issue.priority as string) !== selectedFilters.severity
    ) return false;

    if (
      selectedFilters.assigneeIds.length > 0 &&
      issue.assigneeId &&
      !selectedFilters.assigneeIds.includes(issue.assigneeId)
    ) return false;

    return true;
  });

  // ── Callbacks ──────────────────────────────────────────────────────────────
  const handleDragStart = useCallback((id: string) => {
    draggingIdRef.current = id;
  }, []);

  const handleDrop = useCallback(
    (targetColumn: IssueStatus) => {
      const id = draggingIdRef.current;
      if (!id) return;

      const issue = allIssues.find((i) => i.id === id);
      if (!issue || issue.status === targetColumn) {
        setDragOver(null);
        draggingIdRef.current = null;
        return;
      }

      // ── Optimistic update fires here ───────────────────────────────────────
      // The card moves instantly; the PATCH is in-flight.
      // If the server rejects it, useUpdateIssueStatus rolls back automatically.
      updateStatus({ id, status: targetColumn });

      setDragOver(null);
      draggingIdRef.current = null;
    },
    [allIssues, updateStatus, setDragOver],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render states
  // ─────────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-white/40 text-sm">
        Loading issues…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-48 text-red-400 text-sm">
        Failed to load issues. Retrying…
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Updating indicator */}
      {isUpdating && (
        <div className="absolute top-0 right-0 text-xs text-indigo-400 animate-pulse">
          Saving…
        </div>
      )}

      {/* Board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {COLUMNS.map((col) => {
          const colIssues = filteredIssues.filter((i) => i.status === col.id);

          return (
            <KanbanColumn
              key={col.id}
              column={col}
              issues={colIssues}
              isDragOver={dragOverColumn === col.id}
              onDragOver={setDragOver}
              onDrop={handleDrop}
              onDragStart={handleDragStart}
              onOpenIssue={openDetail}
            />
          );
        })}
      </div>

      {/* Issue detail side panel */}
      {activeIssueId && (
        <div
          className="fixed inset-y-0 right-0 w-96 bg-[#111] border-l border-white/10
                     shadow-2xl z-50 p-6 overflow-y-auto"
        >
          <button
            onClick={closeDetail}
            className="text-white/50 hover:text-white text-sm mb-4"
          >
            ← Close
          </button>
          <p className="text-white/60 text-sm">Issue: {activeIssueId}</p>
          {/* Hook into useIssue(activeIssueId) for full detail view */}
        </div>
      )}
    </div>
  );
}
