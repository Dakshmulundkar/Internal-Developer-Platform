/**
 * boardStore — Zustand store for the Kanban board UI state.
 *
 * Tracks transient UI state that doesn't belong in TanStack Query:
 *  - Which column is being dragged over
 *  - Expanded/collapsed columns
 *  - Active issue detail panel
 *
 * Server data (the actual issues list) lives in TanStack Query cache.
 */

import { create } from 'zustand';
import type { IssueStatus } from '../types/issues';

interface BoardState {
  /** The column a card is currently hovering over during a drag */
  dragOverColumn: IssueStatus | null;
  /** Collapsed columns — user preference */
  collapsedColumns: Set<IssueStatus>;
  /** The issue currently open in the detail side panel */
  activeIssueId: string | null;
  /** Inline-edit mode for an issue */
  editingIssueId: string | null;
}

interface BoardActions {
  setDragOverColumn: (col: IssueStatus | null) => void;
  toggleColumnCollapse: (col: IssueStatus) => void;
  openIssueDetail: (issueId: string) => void;
  closeIssueDetail: () => void;
  setEditingIssue: (issueId: string | null) => void;
}

export const useBoardStore = create<BoardState & BoardActions>()((set) => ({
  // State
  dragOverColumn: null,
  collapsedColumns: new Set<IssueStatus>(),
  activeIssueId: null,
  editingIssueId: null,

  // Actions
  setDragOverColumn: (col) => set({ dragOverColumn: col }),

  toggleColumnCollapse: (col) =>
    set((s) => {
      const next = new Set(s.collapsedColumns);
      next.has(col) ? next.delete(col) : next.add(col);
      return { collapsedColumns: next };
    }),

  openIssueDetail: (issueId) => set({ activeIssueId: issueId }),
  closeIssueDetail: () => set({ activeIssueId: null }),
  setEditingIssue: (issueId) => set({ editingIssueId: issueId }),
}));

// Atomic selectors
export const selectDragOverColumn = (s: BoardState) => s.dragOverColumn;
export const selectCollapsedColumns = (s: BoardState) => s.collapsedColumns;
export const selectActiveIssueId = (s: BoardState) => s.activeIssueId;
export const selectEditingIssueId = (s: BoardState) => s.editingIssueId;
