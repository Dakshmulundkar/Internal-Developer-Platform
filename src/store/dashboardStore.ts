/**
 * dashboardStore — Zustand store for dashboard layout and filter state.
 *
 * Design principles:
 *  - Atomic selectors: each component subscribes to the exact slice it needs.
 *    Zustand's default equality check is referential; primitives never cause
 *    spurious re-renders.
 *  - Persist layout preferences to localStorage via the `persist` middleware.
 *  - Never store server data here — that lives in TanStack Query cache.
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type TimeRange = '1h' | '6h' | '24h' | '7d' | '30d' | 'custom';
export type DashboardLayout = 'grid' | 'list' | 'compact';
export type IncidentStatusFilter = 'all' | 'open' | 'investigating' | 'resolved';
export type SeverityFilter = 'all' | 'critical' | 'high' | 'medium' | 'low';

export interface CustomTimeRange {
  from: string; // ISO 8601
  to: string;   // ISO 8601
}

export interface SelectedFilters {
  incidentStatus: IncidentStatusFilter;
  severity: SeverityFilter;
  projectIds: string[];    // empty = all projects
  assigneeIds: string[];   // empty = all assignees
}

export interface WidgetVisibility {
  alertsSummary: boolean;
  deploymentTimeline: boolean;
  incidentFeed: boolean;
  serviceHealth: boolean;
  issueBoard: boolean;
  aiInsights: boolean;
}

export interface DashboardState {
  // ── Time range ─────────────────────────────────────────────────────────────
  activeTimeRange: TimeRange;
  customTimeRange: CustomTimeRange | null;

  // ── Layout ─────────────────────────────────────────────────────────────────
  layout: DashboardLayout;
  isSidebarOpen: boolean;
  widgetVisibility: WidgetVisibility;

  // ── Filters ────────────────────────────────────────────────────────────────
  selectedFilters: SelectedFilters;

  // ── Active context ──────────────────────────────────────────────────────────
  activeProjectId: string | null;
}

export interface DashboardActions {
  setTimeRange: (range: TimeRange, custom?: CustomTimeRange) => void;
  setLayout: (layout: DashboardLayout) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setFilter: <K extends keyof SelectedFilters>(key: K, value: SelectedFilters[K]) => void;
  resetFilters: () => void;
  toggleWidget: (widget: keyof WidgetVisibility) => void;
  setActiveProject: (projectId: string | null) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default values
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_FILTERS: SelectedFilters = {
  incidentStatus: 'all',
  severity: 'all',
  projectIds: [],
  assigneeIds: [],
};

const DEFAULT_WIDGETS: WidgetVisibility = {
  alertsSummary: true,
  deploymentTimeline: true,
  incidentFeed: true,
  serviceHealth: true,
  issueBoard: true,
  aiInsights: false,
};

const INITIAL_STATE: DashboardState = {
  activeTimeRange: '24h',
  customTimeRange: null,
  layout: 'grid',
  isSidebarOpen: true,
  widgetVisibility: DEFAULT_WIDGETS,
  selectedFilters: DEFAULT_FILTERS,
  activeProjectId: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────────────────────────────────────

export const useDashboardStore = create<DashboardState & DashboardActions>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      setTimeRange: (range, custom = null) =>
        set({ activeTimeRange: range, customTimeRange: custom }),

      setLayout: (layout) =>
        set({ layout }),

      toggleSidebar: () =>
        set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),

      setSidebarOpen: (open) =>
        set({ isSidebarOpen: open }),

      setFilter: (key, value) =>
        set((s) => ({
          selectedFilters: { ...s.selectedFilters, [key]: value },
        })),

      resetFilters: () =>
        set({ selectedFilters: DEFAULT_FILTERS }),

      toggleWidget: (widget) =>
        set((s) => ({
          widgetVisibility: {
            ...s.widgetVisibility,
            [widget]: !s.widgetVisibility[widget],
          },
        })),

      setActiveProject: (projectId) =>
        set({ activeProjectId: projectId }),
    }),
    {
      name: 'idp-dashboard-prefs',
      storage: createJSONStorage(() => localStorage),
      // Only persist layout preferences, not transient filter state
      partialize: (state) => ({
        layout: state.layout,
        isSidebarOpen: state.isSidebarOpen,
        widgetVisibility: state.widgetVisibility,
        activeTimeRange: state.activeTimeRange,
      }),
    },
  ),
);

// ─────────────────────────────────────────────────────────────────────────────
// Atomic selectors
//
// Import these instead of calling useDashboardStore with inline selectors.
// Stable function references prevent unnecessary re-renders.
// ─────────────────────────────────────────────────────────────────────────────

export const selectTimeRange = (s: DashboardState) => s.activeTimeRange;
export const selectCustomTimeRange = (s: DashboardState) => s.customTimeRange;
export const selectLayout = (s: DashboardState) => s.layout;
export const selectIsSidebarOpen = (s: DashboardState) => s.isSidebarOpen;
export const selectSelectedFilters = (s: DashboardState) => s.selectedFilters;
export const selectWidgetVisibility = (s: DashboardState) => s.widgetVisibility;
export const selectActiveProjectId = (s: DashboardState) => s.activeProjectId;

// Fine-grained filter selectors so components only re-render for their slice
export const selectIncidentStatusFilter = (s: DashboardState) =>
  s.selectedFilters.incidentStatus;
export const selectSeverityFilter = (s: DashboardState) =>
  s.selectedFilters.severity;
export const selectProjectIdFilter = (s: DashboardState) =>
  s.selectedFilters.projectIds;
