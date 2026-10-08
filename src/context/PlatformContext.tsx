import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { api, isApiAvailable, ensureValidSession } from '../services/api';
import type { 
  Project, Deployment, Incident, RollbackOperation, Notification, AuditLog, User,
  DeploymentStatus, IncidentStatus, IncidentSeverity, ProviderType, EnvironmentType,
  PluginInstallation, MonitoringAlert, SentryIssue, TeamMember, ProjectRole, SecurityMetadata
} from '../types/platform';
import {
  pluginDefinitions
} from '../data/seedData';
import { avatarDataUri } from '../lib/avatar';

function storageGet(key: string): string | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage.getItem(key);
  } catch { return null; }
}

function storageSet(key: string, value: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(key, value);
  } catch { /* ignore (private mode / quota) */ }
}

function storageRemove(key: string): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.removeItem(key);
  } catch { /* ignore */ }
}

export type PageType = 
  | 'dashboard'
  | 'projects'
  | 'create-project'
  | 'project-details'
  | 'deployments'
  | 'deployment-details'
  | 'incidents'
  | 'rollback-recovery'
  | 'ai-assistant'
  | 'notifications'
  | 'settings'
  | 'integrations'
  | 'plugin-config'
  | 'monitoring'
  | 'automation'
  | 'scheduled-tasks'
  | 'login';

interface PlatformContextProps {
  user: User | null;
  /** False until the stored session has been validated on boot. Gate routes on this. */
  authReady: boolean;
  projects: Project[];
  deployments: Deployment[];
  incidents: Incident[];
  securityIncidents: Incident[];
  rollbackOperations: RollbackOperation[];
  notifications: Notification[];
  auditLogs: AuditLog[];
  pluginInstallations: PluginInstallation[];
  monitoringAlerts: MonitoringAlert[];
  sentryIssues: SentryIssue[];
  currentPage: PageType;
  activeProjectId: string | null;
  activeDeploymentId: string | null;
  activeIncidentId: string | null;
  activePluginId: string | null;
  activeSettingsCard: string | null;
  
  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  
  // Navigation
  navigateTo: (page: PageType, contextIds?: { projectId?: string; deploymentId?: string; incidentId?: string; pluginId?: string; settingsCard?: string }) => void;
  
  // Auth Actions
  loginUser: (email: string, provider?: string) => Promise<void>;
  logoutUser: () => void;
  updateUserConnections: (connections: { github?: string; vercel?: boolean; netlify?: boolean }) => void;
  
  // Core Actions
  createProject: (projectData: Omit<Project, 'id' | 'createdAt' | 'ownerId' | 'status' | 'webhookUrl' | 'webhookSecret'>) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  startRollback: (projectId: string, targetDeploymentId: string) => Promise<void>;
  addComment: (incidentId: string, content: string) => void;
  resolveIncident: (incidentId: string) => void;
  markNotificationAsRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  
  // Plugin Actions
  installPlugin: (pluginId: string) => void;
  uninstallPlugin: (installationId: string) => void;
  updatePluginConfig: (installationId: string, config: Partial<PluginInstallation> & { apiKey?: string }) => Promise<void>;
  
  // Data Sync
  refreshData: () => Promise<void>;
  syncDeployments: (projectId: string) => Promise<void>;

  // Incident Update
  updateIncident: (incidentId: string, updates: Partial<Incident>) => void;

  // Security Triage
  fetchSecurityIncidents: () => Promise<void>;
  resolveSecurityIncident: (incidentId: string, notes?: string) => Promise<void>;
  ignoreSecurityIncident: (incidentId: string, reason: string) => Promise<void>;

  // Team Management
  teamMembers: TeamMember[];
  addTeamMember: (member: Omit<TeamMember, 'id' | 'addedAt' | 'addedBy'>) => void;
  removeTeamMember: (memberId: string) => void;
  updateTeamMemberRole: (memberId: string, role: ProjectRole) => void;
  acceptTeamInvite: (teamMemberId: string, notificationId: string, inviteToken?: string) => Promise<void>;
  declineTeamInvite: (teamMemberId: string, notificationId: string, inviteToken?: string) => Promise<void>;
  pendingInvites: TeamMember[];
  refreshPendingInvites: () => Promise<void>;

  // Webhook Simulator
  triggerWebhookSimulation: (projectId: string, forceStatus?: DeploymentStatus) => void;
}

const PlatformContext = createContext<PlatformContextProps | undefined>(undefined);

export const PlatformProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // In API mode, wipe stale seed data from localStorage on startup so it never shows.
  // This runs once synchronously before any state is initialized.
  if (import.meta.env.VITE_API_URL && !storageGet('idp_jwt')) {
    const seedKeys = [
      'idp_projects', 'idp_deployments', 'idp_incidents', 'idp_rollbacks',
      'idp_notifications', 'idp_audit', 'idp_plugins', 'idp_alerts',
    ];
    seedKeys.forEach(k => storageRemove(k));
  }

  // Helper: in API mode, always start empty (no seed data)
  // API mode includes both direct (VITE_API_URL) and proxy (VITE_USE_API) modes.
  const isApiMode = Boolean(import.meta.env.VITE_API_URL || import.meta.env.VITE_USE_API);
  const hasJwt = Boolean(storageGet('idp_jwt'));

  // Load initial states from localStorage (backend is the source of truth).
  const [user, setUser] = useState<User | null>(() => {
    // Only restore user if we have a valid JWT token.
    const jwt = storageGet('idp_jwt');
    if (!jwt) return null; // No token → go to login
    // Basic JWT expiry check (decode payload, check exp)
    try {
      const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        // Token expired — clear and go to login
        storageRemove('idp_jwt');
        storageRemove('idp_user');
        return null;
      }
      // Token valid — restore user
      const saved = storageGet('idp_user');
      if (saved) {
        try { return JSON.parse(saved); } catch { return null; }
      }
      return null;
    } catch {
      storageRemove('idp_jwt');
      storageRemove('idp_user');
      return null;
    }
  });

  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = storageGet('idp_projects');
    return saved ? JSON.parse(saved) : [];
  });

  const [deployments, setDeployments] = useState<Deployment[]>(() => {
    const saved = storageGet('idp_deployments');
    return saved ? JSON.parse(saved) : [];
  });

  const [incidents, setIncidents] = useState<Incident[]>(() => {
    const saved = storageGet('idp_incidents');
    return saved ? JSON.parse(saved) : [];
  });

  const [securityIncidents, setSecurityIncidents] = useState<Incident[]>(() => {
    const saved = storageGet('idp_security_incidents');
    return saved ? JSON.parse(saved) : [];
  });

  const [rollbackOperations, setRollbackOperations] = useState<RollbackOperation[]>(() => {
    const saved = storageGet('idp_rollbacks');
    return saved ? JSON.parse(saved) : [];
  });

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = storageGet('idp_notifications');
    return saved ? JSON.parse(saved) : [];
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = storageGet('idp_audit');
    return saved ? JSON.parse(saved) : [];
  });

  const [pluginInstallations, setPluginInstallations] = useState<PluginInstallation[]>(() => {
    const saved = storageGet('idp_plugins');
    return saved ? JSON.parse(saved) : [];
  });

  const [monitoringAlerts, setMonitoringAlerts] = useState<MonitoringAlert[]>(() => {
    const saved = storageGet('idp_alerts');
    return saved ? JSON.parse(saved) : [];
  });

  const [sentryIssues] = useState<SentryIssue[]>(() => []);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => {
    const saved = storageGet('idp_team');
    return saved ? JSON.parse(saved) : [];
  });

  // Pending invites for the currently logged-in user
  const [pendingInvites, setPendingInvites] = useState<TeamMember[]>([]);

  // Navigation Context
  const [currentPage, setCurrentPage] = useState<PageType>(() => {
    // Determine if we have a valid session synchronously, without async work
    const jwt = storageGet('idp_jwt');
    const savedPage = storageGet('idp_page') as PageType;

    // Validate the saved page is a real page, not 'login'
    const isValidPage = (p: string | null): p is PageType =>
      !!p && p !== 'login' && p !== 'null';

    // Only restore page if JWT exists AND is not expired
    if (jwt) {
      try {
        const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (!payload.exp || payload.exp * 1000 > Date.now()) {
          return isValidPage(savedPage) ? savedPage : 'dashboard';
        }
      } catch { /* invalid jwt */ }
    }
    return 'login';
  });

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    return storageGet('idp_active_project');
  });

  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(() => {
    return storageGet('idp_active_deploy');
  });

  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(() => {
    return storageGet('idp_active_incident');
  });

  const [activePluginId, setActivePluginId] = useState<string | null>(() => {
    return storageGet('idp_active_plugin');
  });

  const [activeSettingsCard, setActiveSettingsCard] = useState<string | null>(null);

  // Auth hydration gate — optimistic: a synchronously-restorable session
  // renders immediately (no spinner), server validation runs in background.
  const [authReady, setAuthReady] = useState(() => {
    const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_USE_API;
    if (apiUrl) return Boolean(storageGet('idp_jwt'));
    return Boolean(storageGet('idp_user'));
  });

  // Theme state - persisted to localStorage
  const [theme, setThemeState] = useState<'light' | 'dark' | 'system'>(() => {
    const saved = localStorage.getItem('aether-theme');
    return (saved === 'light' || saved === 'dark' || saved === 'system') ? saved : 'dark';
  });

  // Apply theme class to <html> and persist to localStorage
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.add(prefersDark ? 'dark' : 'light');
    } else {
      root.classList.add(theme);
    }
    
    localStorage.setItem('aether-theme', theme);
  }, [theme]);

  const setTheme = (newTheme: 'light' | 'dark' | 'system') => {
    setThemeState(newTheme);
  };

  // ── Session persistence: every in-memory user change is mirrored to
  // localStorage so a hard reload can rehydrate. Logout removes it explicitly.
  useEffect(() => {
    if (user) {
      try { storageSet('idp_user', JSON.stringify(user)); } catch { /* ignore */ }
    }
  }, [user]);

  // ── Boot hydration (background): the router already rendered optimistically
  // from cache above; this only validates the stored JWT against the backend.
  // 401 (after the client's automatic silent-refresh attempt) means the session
  // is really dead → clear. Any other failure (backend down, offline) keeps
  // the cached user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isApiMode && storageGet('idp_jwt')) {
          await ensureValidSession().catch(() => undefined);
          const me = await api.auth.me().catch((err: unknown) => {
            const status = (err as Error & { status?: number })?.status;
            if (status === 401 && !cancelled) {
              storageRemove('idp_jwt');
              storageRemove('idp_refresh_token');
              storageRemove('idp_user');
              setUser(null);
              setCurrentPage('login');
            }
            return null;
          }) as Record<string, unknown> | null;
          if (me && !cancelled && (me.id || me.email)) {
            setUser(prev => {
              const base = prev ?? {
                id: 'u_api',
                name: 'Developer',
                email: '',
                avatarUrl: avatarDataUri('Developer'),
                role: 'admin' as const,
                connectedGithub: '',
                connectedVercel: false,
                connectedNetlify: false,
              };
              return {
                ...base,
                id: String(me.id ?? base.id),
                email: String(me.email ?? base.email),
                name: String((me.name ?? me.full_name ?? base.name) as string),
                avatarUrl: String((me.avatar_url ?? base.avatarUrl) as string),
                role: ((me.role as User['role']) ?? base.role),
              };
            });
          }
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // WebSocket ref for real-time updates
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsReconnectDelayRef = useRef<number>(1000);
  const projectsRef = useRef<Project[]>([]);
  useEffect(() => { projectsRef.current = projects; }, [projects]);

  // ── Batch localStorage writes — one effect, debounced ────────────────────
  // Replaces 9 individual effects. Prevents 9x localStorage writes on every state change.
  useEffect(() => {
    const t = setTimeout(() => {
      storageSet('idp_user', JSON.stringify(user));
      storageSet('idp_projects', JSON.stringify(projects));
      storageSet('idp_deployments', JSON.stringify(deployments));
      storageSet('idp_incidents', JSON.stringify(incidents));
      storageSet('idp_security_incidents', JSON.stringify(securityIncidents));
      storageSet('idp_rollbacks', JSON.stringify(rollbackOperations));
      storageSet('idp_notifications', JSON.stringify(notifications));
      storageSet('idp_audit', JSON.stringify(auditLogs));
      storageSet('idp_plugins', JSON.stringify(pluginInstallations));
      storageSet('idp_alerts', JSON.stringify(monitoringAlerts));
      storageSet('idp_team', JSON.stringify(teamMembers));
      storageSet('idp_page', currentPage);
    }, 500); // debounce: only write after 500ms of no changes
    return () => clearTimeout(t);
  }, [user, projects, deployments, incidents, securityIncidents, rollbackOperations, notifications, auditLogs, pluginInstallations, monitoringAlerts, teamMembers, currentPage]);

  // After restoring user from JWT on page load, ensure we're not stuck on login page
  useEffect(() => {
    if (user && currentPage === 'login') {
      setCurrentPage('dashboard');
    }
    // If no user but page is not login, redirect to login — but only in API mode
    // where we have definitive token-based auth. In demo mode, user can be null
    // while still being on a "protected" page (just not authenticated).
    if (!user && currentPage !== 'login' && isApiMode) {
      // Small delay to allow async JWT check to complete before redirecting
      const t = setTimeout(() => {
        if (!storageGet('idp_jwt')) {
          setCurrentPage('login');
        }
      }, 100);
      return () => clearTimeout(t);
    }
  }, [user, currentPage, isApiMode]);

  // Fix 3: On first render, silently refresh the JWT if it is near expiry so
  // the 1-hour Supabase access token never dies mid-session.
  useEffect(() => {
    ensureValidSession();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Mappers: snake_case API rows → camelCase frontend types ───────────────
  const mapRemoteProject = (r: Record<string, unknown>): Project => ({
    id: r.id as string,
    name: (r.name as string) || '',
    description: (r.description as string) || '',
    repoOwner: (r.repo_owner as string) || '',
    repoName: (r.repo_name as string) || '',
    branch: (r.branch as string) || 'main',
    provider: (r.provider as ProviderType) || 'vercel',
    environment: (r.environment as EnvironmentType) || 'production',
    status: (r.status as DeploymentStatus) || 'queued',
    createdAt: (r.created_at as string) || new Date().toISOString(),
    ownerId: (r.owner_id as string) || '',
    vercelProjectId: r.vercel_project_id as string | undefined,
    netlifySiteId: r.netlify_site_id as string | undefined,
    webhookUrl: r.webhook_url as string | undefined,
    serviceName: r.service_name as string | undefined,
    serviceRepositoryUrl: r.service_repository_url as string | undefined,
    serviceType: r.service_type as string | undefined,
    securityConfig: r.security_config as Record<string, unknown> | undefined,
  });

  const mapRemoteDeployment = (r: Record<string, unknown>, projectName?: string): Deployment => {
    // stages/logs may arrive as JSON strings (text columns) or malformed rows —
    // normalize so a single bad row can never blank the pipelines page.
    let stages: Deployment['stages'] = undefined;
    const rawStages = r.stages;
    if (typeof rawStages === 'string') {
      try {
        const parsed: unknown = JSON.parse(rawStages);
        if (Array.isArray(parsed)) {
          stages = parsed
            .filter((s): s is { name: string; status: string; durationMs: number } =>
              !!s && typeof s === 'object' && typeof (s as { name?: unknown }).name === 'string')
            .map(s => ({
              name: String(s.name),
              status: (['pending', 'running', 'success', 'failed'] as string[]).includes(String(s.status))
                ? String(s.status) as 'pending' | 'running' | 'success' | 'failed'
                : 'pending' as const,
              durationMs: Number(s.durationMs) || 0,
            }));
        }
      } catch { /* keep undefined → UI falls back to defaults */ }
    } else if (Array.isArray(rawStages)) {
      stages = rawStages
        .filter(s => !!s && typeof s === 'object' && typeof (s as { name?: unknown }).name === 'string')
        .map(s => {
          const o = s as { name?: unknown; status?: unknown; durationMs?: unknown };
          return {
            name: String(o.name),
            status: (['pending', 'running', 'success', 'failed'] as string[]).includes(String(o.status))
              ? String(o.status) as 'pending' | 'running' | 'success' | 'failed'
              : 'pending' as const,
            durationMs: Number(o.durationMs) || 0,
          };
        });
    }
    let logs: string[] | undefined = undefined;
    if (typeof r.logs === 'string') {
      logs = r.logs.split('\n');
    } else if (Array.isArray(r.logs)) {
      logs = r.logs.filter((l): l is string => typeof l === 'string');
    }
    return {
    id: r.id as string,
    projectId: (r.project_id as string) || '',
    projectName: projectName || (r.project_id as string) || '',
    version: (r.version as string) || (r.external_event_id as string) || 'unknown',
    status: ((r.status as string) || 'queued') as DeploymentStatus,
    commitHash: (r.commit_hash as string) || '',
    commitMessage: (r.commit_message as string) || '',
    branch: (r.branch as string) || 'main',
    author: (r.author as string) || '',
    authorAvatar: r.author_avatar as string | undefined,
    provider: (r.provider as ProviderType) || 'vercel',
    durationMs: (r.duration_ms as number) || 0,
    createdAt: (r.created_at as string) || new Date().toISOString(),
    url: r.url as string | undefined,
    errorMessage: r.error_message as string | undefined,
    stages,
    logs,
  };
  };

  const mapRemoteIncident = (r: Record<string, unknown>): Incident => ({
    id: r.id as string,
    projectId: (r.project_id as string) || '',
    projectName: '',
    deploymentId: r.deployment_id as string | undefined,
    severity: ((r.severity as string) || 'high') as IncidentSeverity,
    provider: ((r.provider as string) || 'vercel') as ProviderType,
    title: (r.title as string) || 'Incident',
    description: (r.description as string) || '',
    status: ((r.status as string) || 'open') as IncidentStatus,
    assignedTo: r.assigned_to as string | undefined,
    createdAt: (r.created_at as string) || new Date().toISOString(),
    resolvedAt: r.resolved_at as string | undefined,
    ignoredReason: r.ignored_reason as string | undefined,
    feedbackIsReal: r.feedback_is_real as boolean | undefined,
    feedbackComment: r.feedback_comment as string | undefined,
    suggestedAction: r.suggested_action as string | undefined,
    serviceId: r.service_id as string | undefined,
    serviceRepositoryUrl: r.service_repository_url as string | undefined,
    visibilityScope: r.visibility_scope as string | undefined,
    source: r.source as string | undefined,
    securityMetadata: r.security_metadata as SecurityMetadata | undefined,
    comments: [],
    timeline: [],
  });

  const mapRemoteAlert = (r: Record<string, unknown>): MonitoringAlert => ({
    id: r.id as string,
    source: ((r.source as string) || 'grafana') as MonitoringAlert['source'],
    title: (r.title as string) || 'Alert',
    description: (r.description as string) || '',
    severity: ((r.severity as string) || 'medium') as MonitoringAlert['severity'],
    status: ((r.status as string) || 'firing') as MonitoringAlert['status'],
    projectId: r.project_id as string | undefined,
    deploymentId: r.deployment_id as string | undefined,
    incidentId: r.incident_id as string | undefined,
    labels: r.labels as Record<string, string> | undefined,
    value: r.value as string | undefined,
    threshold: r.threshold as string | undefined,
    firedAt: (r.fired_at as string) || new Date().toISOString(),
    resolvedAt: r.resolved_at as string | undefined,
  });

  const mapRemotePlugin = (r: Record<string, unknown>): PluginInstallation => {
    const cfg = (r.config_data as Record<string, unknown>) || {};
    return {
      id: r.id as string,
      pluginId: (r.plugin_id as string) || '',
      pluginName: (r.plugin_name as string) || '',
      category: ((r.category as string) || 'deployment') as PluginInstallation['category'],
      status: ((r.status as string) || 'disconnected') as PluginInstallation['status'],
      apiKeyHint: (r.api_key_hint as string) || (cfg.api_key_hint as string) || '',
      baseUrl: (r.base_url as string) || '',
      projectSelector: (r.project_selector as string) || '',
      webhookUrl: r.webhook_url as string | undefined,
      lastSyncAt: r.last_sync_at as string | undefined,
      installedAt: (r.created_at as string) || new Date().toISOString(),
      installedById: (r.installed_by as string) || '',
      enabledForProjects: (r.enabled_for_projects as string[]) || [],
      configData: cfg,
    };
  };

  const mapRemoteNotification = (r: Record<string, unknown>): Notification => ({
    id: r.id as string,
    title: (r.title as string) || '',
    message: (r.message as string) || '',
    type: ((r.type as string) || 'info') as Notification['type'],
    projectId: r.project_id as string | undefined,
    incidentId: r.incident_id as string | undefined,
    deploymentId: r.deployment_id as string | undefined,
    teamMemberId: r.team_member_id as string | undefined,
    inviteToken: (r.invite_token as string) || undefined,
    read: Boolean(r.read),
    createdAt: (r.created_at as string) || new Date().toISOString(),
  });

  const mapRemoteAuditLog = (r: Record<string, unknown>): AuditLog => ({
    id: r.id as string,
    userId: (r.user_id as string) || '',
    userName: (r.user_name as string) || 'System',
    action: (r.action as string) || '',
    projectId: r.project_id as string | undefined,
    details: (r.details as string) || '',
    createdAt: (r.created_at as string) || new Date().toISOString(),
  });

  const mapRemoteTeamMember = (r: Record<string, unknown>): TeamMember => ({
    id: r.id as string,
    userId: (r.user_id as string) || '',
    name: (r.name as string) || '',
    email: (r.email as string) || '',
    role: ((r.role as string) || 'viewer') as ProjectRole,
    projectId: (r.project_id as string) || '',
    addedAt: (r.created_at as string) || new Date().toISOString(),
    addedBy: (r.added_by as string) || '',
    status: (r.status as TeamMember['status']) || 'accepted',
    inviteToken: (r.invite_token as string) || undefined,
    inviteExpiresAt: (r.invite_expires_at as string) || undefined,
  });

  // Refresh live data from API
  const refreshData = async () => {
    if (!isApiAvailable() || !user) return;
    try {
      const [remoteProjects, remoteIncidents, remoteNotifications, remoteDeployments, remoteAlerts, remotePlugins, remoteAudit, remoteTeam, remoteSecurity] = await Promise.all([
        api.projects.list().catch(() => null),
        api.incidents.list().catch(() => null),
        api.notifications.list().catch(() => null),
        api.deployments.list().catch(() => null),
        api.monitoring.getAlerts().catch(() => null),
        api.plugins.list().catch(() => null),
        api.audit.list(50).catch(() => null),
        api.team.list().catch(() => null),
        api.security.list().catch(() => null),
      ]);

      let projectMap = new Map<string, string>();
      if (remoteProjects) {
        const mapped = (remoteProjects as Record<string, unknown>[]).map(mapRemoteProject);
        setProjects(mapped);
        projectMap = new Map(mapped.map(p => [p.id, p.name]));
      }

      if (remoteDeployments) {
        const deps = (remoteDeployments as Record<string, unknown>[]).map(d => mapRemoteDeployment(d, projectMap.get(d.project_id as string)));
        setDeployments(deps);
      }

      if (remoteIncidents) {
        const incs = (remoteIncidents as Record<string, unknown>[]).map(r => ({
          ...mapRemoteIncident(r),
          projectName: projectMap.get(r.project_id as string) || '',
        }));
        setIncidents(incs);
      }

      if (remoteSecurity) {
        const secIncs = ((remoteSecurity as { incidents: Record<string, unknown>[] }).incidents || []).map(r => ({
          ...mapRemoteIncident(r),
          projectName: projectMap.get(r.project_id as string) || '',
        }));
        setSecurityIncidents(secIncs);
      }

      if (remoteNotifications) setNotifications((remoteNotifications as Record<string, unknown>[]).map(mapRemoteNotification));
      if (remoteAlerts) setMonitoringAlerts((remoteAlerts as Record<string, unknown>[]).map(r => ({
        ...mapRemoteAlert(r),
        projectName: projectMap.get(r.project_id as string) || (r.project_name as string) || '',
      })));
      if (remotePlugins) setPluginInstallations((remotePlugins as Record<string, unknown>[]).map(mapRemotePlugin));
      if (remoteAudit) setAuditLogs((remoteAudit as Record<string, unknown>[]).map(mapRemoteAuditLog));
      if (remoteTeam) setTeamMembers((remoteTeam as Record<string, unknown>[]).map(mapRemoteTeamMember));
    } catch (err) {
      console.warn('[PlatformContext] refreshData error:', err);
    }
  };

  /** Fetch pending invites for the current user from the backend (API mode only). */
  const refreshPendingInvites = async () => {
    if (!isApiAvailable() || !user) return;
    try {
      const invites = await api.team.getPendingInvites();
      // Map backend shape to TeamMember
      const mapped: TeamMember[] = (invites as Record<string, unknown>[]).map(r => ({
        id: r.id as string,
        userId: (r.user_id as string) || '',
        name: (r.name as string) || (r.email as string) || '',
        email: (r.email as string) || '',
        role: (r.role as ProjectRole) || 'developer',
        projectId: (r.project_id as string) || '',
        projectName: (r.project_name as string) || '',
        status: 'invited' as const,
        addedAt: (r.created_at as string) || (r.added_at as string) || new Date().toISOString(),
        addedBy: '',
        inviteToken: (r.invite_token as string) || '',
        inviteExpiresAt: (r.invite_expires_at as string) || '',
      }));
      setPendingInvites(mapped);
    } catch (err) {
      console.warn('[PlatformContext] refreshPendingInvites error:', err);
    }
  };

  const syncDeployments = async (projectId: string) => {
    if (!isApiAvailable()) return;
    try {
      await api.deployments.sync(projectId);
      await refreshData();
    } catch (err) {
      console.error('[deployments] sync failed:', err);
    }
  };

  // Fetch live data from API on login and poll periodically
  useEffect(() => {
    if (!isApiAvailable() || !user) return;
    // Clear any stale localStorage before loading from API
    ['idp_projects','idp_incidents','idp_notifications','idp_deployments','idp_plugins','idp_alerts','idp_audit','idp_team'].forEach(k => storageRemove(k));
    // Defer initial load by one tick so the dashboard shell renders first,
    // giving the user immediate visual feedback before data arrives.
    const initialLoad = setTimeout(() => {
      refreshData();
      refreshPendingInvites(); // load invite banner immediately after login
    }, 0);

    // Poll every 30s (was 10s — 3x less load on the backend)
    const interval = setInterval(refreshData, 30_000);
    // Poll pending invites every 60s so a new invite from another admin appears promptly
    const inviteInterval = setInterval(refreshPendingInvites, 60_000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(interval);
      clearInterval(inviteInterval);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-check pending invites whenever the tab regains focus — covers invites
  // that arrived while the WebSocket wasn't connected or the tab was hidden,
  // so the banner never stays stale.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) refreshPendingInvites();
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigation Helper
  const navigateTo = (page: PageType, contextIds?: { projectId?: string; deploymentId?: string; incidentId?: string; pluginId?: string; settingsCard?: string }) => {
    // Route guard — bounce to login if no user and trying to access protected page
    if (!user && page !== 'login') {
      setCurrentPage('login');
      return;
    }

    if (contextIds?.projectId) {
      setActiveProjectId(contextIds.projectId);
      storageSet('idp_active_project', contextIds.projectId);
    }
    if (contextIds?.deploymentId) {
      setActiveDeploymentId(contextIds.deploymentId);
      storageSet('idp_active_deploy', contextIds.deploymentId);
    }
    if (contextIds?.incidentId) {
      setActiveIncidentId(contextIds.incidentId);
      storageSet('idp_active_incident', contextIds.incidentId);
    }
    if (contextIds?.pluginId) {
      setActivePluginId(contextIds.pluginId);
      storageSet('idp_active_plugin', contextIds.pluginId);
    }
    if (contextIds?.settingsCard) {
      setActiveSettingsCard(contextIds.settingsCard);
    } else {
      setActiveSettingsCard(null);
    }
    
    setCurrentPage(page);
  };

  // WebSocket connection helper with exponential backoff
  const connectWebSocket = (userId: string) => {
    const wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) return;

    // Close any existing socket first so a re-login never leaves two live
    // connections open (also prevents stale onclose reconnecting the old user).
    if (wsRef.current && wsRef.current.readyState < WebSocket.CLOSING) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear any pending reconnect timer
    if (wsReconnectTimeoutRef.current) {
      clearTimeout(wsReconnectTimeoutRef.current);
      wsReconnectTimeoutRef.current = null;
    }

    const ws = new WebSocket(`${wsUrl}/ws/${userId}?token=${encodeURIComponent(storageGet('idp_jwt') || '')}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type?: string; event_type?: string; data: Record<string, unknown> };
        const eventType = (msg.event_type || msg.type) ?? '';
        switch (eventType) {
          case 'deployment.status_changed': {
            const d = msg.data;
            setDeployments(prev =>
              prev.map(existing => existing.id === d.id
                ? { ...existing, ...mapRemoteDeployment(d), projectName: existing.projectName }
                : existing)
            );
            break;
          }
          case 'incident.created': {
            const inc = mapRemoteIncident(msg.data);
            const proj = projectsRef.current.find(p => p.id === inc.projectId);
            setIncidents(prev => [{ ...inc, projectName: proj?.name || '' }, ...prev]);
            if (inc.source === 'security_triage' || inc.provider === 'trivy') {
              setSecurityIncidents(prev => [{ ...inc, projectName: proj?.name || '' }, ...prev]);
            }
            break;
          }
          case 'incident.changed': {
            const data = msg.data?.incident as Record<string, unknown> | undefined;
            if (!data) break;
            const inc = mapRemoteIncident(data);
            // Broadcast rows don't carry projectName/comments/timeline — preserve
            // the locally-rendered values when merging the state change.
            const applyChange = (prev: Incident[]) => prev.map(existing =>
              existing.id === inc.id
                ? {
                    ...existing,
                    ...inc,
                    projectName: inc.projectName || existing.projectName,
                    comments: existing.comments,
                    timeline: existing.timeline,
                  }
                : existing
            );
            setIncidents(applyChange);
            if (inc.source === 'security_triage' || inc.provider === 'trivy') {
              setSecurityIncidents(applyChange);
            }
            break;
          }
          case 'rollback.progress': {
            const rb = msg.data;
            setRollbackOperations(prev =>
              prev.map(r => r.id === rb.id
                ? { ...r, status: (rb.status as RollbackOperation['status']) || r.status, completedAt: (rb.completed_at as string) || r.completedAt }
                : r)
            );
            break;
          }
          case 'notification.new': {
            const nd = msg.data as Record<string, unknown>;
            setNotifications(prev => [mapRemoteNotification(nd), ...prev]);
            // Instant invites: a team_invite notification means a new pending
            // invite exists for us — fetch it immediately so the banner shows
            // without waiting for the polling interval.
            if (nd.type === 'team_invite') {
              void refreshPendingInvites();
            }
            break;
          }
          case 'team.members.changed': {
            // A teammate accepted/declined (either via this screen or another
            // connected device). Re-pull team + pending invites + projects so
            // the new member appears / the invite banner disappears instantly,
            // exactly like a real-time Slack invite.
            void refreshData();
            void refreshPendingInvites();
            break;
          }
          default:
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      // Exponential backoff with jitter: prevents thundering herd on reconnect
      const base = Math.min(wsReconnectDelayRef.current, 30000);
      // Jitter: multiply by 0.5–1.0 random factor so clients don't all reconnect simultaneously
      const jittered = base * (0.5 + Math.random() * 0.5);
      wsReconnectTimeoutRef.current = setTimeout(() => {
        wsReconnectDelayRef.current = Math.min(base * 2, 30000);
        connectWebSocket(userId);
      }, jittered);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onopen = () => {
      // Reset backoff on successful connection
      wsReconnectDelayRef.current = 1000;
    };
  };

  // Auth Operations
  const loginUser = async (email: string, passwordOrProvider?: string) => {
    const isGitHub = passwordOrProvider === 'GitHub';
    const isGitHubOAuth = passwordOrProvider === 'GitHubOAuth';
    const isGoogle = passwordOrProvider === 'Google';

    if (!isApiAvailable()) {
      throw new Error('Backend unreachable. Start the API server and try again.');
    }
    {
      // Real authentication only — no demo fallback
      try {
        if (isGoogle) {
          alert('Google login is not configured yet. Please use email/password or GitHub.');
          return;
        }

        // ── GitHub OAuth callback — token + user info packed into email param ──
        if (isGitHubOAuth) {
          // Format: __oauth__<jwt>__<email>__<name>__<avatar>__<username>__
          const parts = email.split('__');
          // parts: ['', 'oauth', jwt, email, name, avatar, username, '']
          const jwt = parts[2] || '';
          const ghEmail = parts[3] || '';
          const ghName = parts[4] || 'Developer';
          const ghAvatar = parts[5] || '';
          const ghUsername = parts[6] || '';

          if (!jwt) {
            alert('GitHub OAuth failed — no token received. Please try again.');
            return;
          }

          const oauthUser: User = {
            id: 'gh_oauth_' + ghUsername,
            name: ghName,
            email: ghEmail,
            avatarUrl: ghAvatar || avatarDataUri(ghName),
            role: 'admin',
            connectedGithub: ghUsername,
            connectedVercel: false,
            connectedNetlify: false,
          };

          storageSet('idp_jwt', jwt);
          setUser(oauthUser);

          setAuditLogs(prev => [{
            id: 'a_' + Math.random().toString(36).substr(2, 9),
            userId: oauthUser.id, userName: oauthUser.name,
            action: 'USER_LOGIN',
            details: 'Signed in via GitHub OAuth. GitHub integration auto-configured.',
            createdAt: new Date().toISOString()
          }, ...prev]);
          connectWebSocket(oauthUser.id);
          setCurrentPage('dashboard');
          // Load API data in background — repos will appear after refreshData()
          setTimeout(() => refreshData(), 0);
          return;
        }

        if (isGitHub) {
          // Legacy PAT login (kept for backwards compatibility)
          const ghResult = await api.auth.loginGithub(email);
          if (!ghResult.access_token) {
            alert('GitHub login succeeded but no session was created. Please try email/password login instead.');
            return;
          }
          const apiUser: User = {
            id: ghResult.user.id,
            name: ghResult.user.name || ghResult.github_username || 'Developer',
            email: ghResult.user.email,
            avatarUrl: ghResult.avatar_url || avatarDataUri(ghResult.user.name || ghResult.github_username || 'Developer'),
            role: (ghResult.user.role as 'admin' | 'developer' | 'operator') || 'admin',
            connectedGithub: ghResult.github_username || 'connected',
            connectedVercel: false,
            connectedNetlify: false,
          };
          storageSet('idp_jwt', ghResult.access_token);
          setUser(apiUser);

          try {
            const setup = await api.auth.githubSetup(email);
            if (setup.repos && setup.repos.length > 0) {
              const existingNames = new Set((projects as Array<{repoName: string}>).map(p => p.repoName));
              const newProjects = setup.repos
                .filter(r => !existingNames.has(r.name))
                .slice(0, 20)
                .map(r => ({
                  id: 'gh_' + r.id,
                  name: r.name,
                  description: r.description || `GitHub repo: ${r.full_name}`,
                  repoOwner: r.owner,
                  repoName: r.name,
                  branch: r.default_branch,
                  provider: 'vercel' as const,
                  environment: 'production' as const,
                  status: 'queued' as const,
                  createdAt: r.pushed_at || new Date().toISOString(),
                  ownerId: apiUser.id,
                }));
              if (newProjects.length > 0) {
                setProjects(prev => [...newProjects, ...prev]);
              }
            }
          } catch {
            // Setup is best-effort — login still succeeds
          }

          setAuditLogs(prev => [{
            id: 'a_' + Math.random().toString(36).substr(2, 9),
            userId: apiUser.id, userName: apiUser.name,
            action: 'USER_LOGIN',
            details: 'Signed in via GitHub PAT. GitHub integration auto-configured.',
            createdAt: new Date().toISOString()
          }, ...prev]);
          connectWebSocket(apiUser.id);
          setCurrentPage('dashboard');
          return;
        }

        // Email + password login
        const result = await api.auth.login(email, passwordOrProvider || '');
        const token = result.access_token;
        storageSet('idp_jwt', token);
        if (result.refresh_token) storageSet('idp_refresh_token', result.refresh_token);

        const payloadB64 = token.split('.')[1];
        const payload = JSON.parse(atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')));
        const githubUsername = payload.user_metadata?.user_name || payload.user_metadata?.preferred_username || '';
        const displayName =
          payload.name ||
          payload.user_metadata?.full_name ||
          payload.user_metadata?.name ||
          payload.email ||
          email ||
          'Developer';

        const apiUser: User = {
          id: payload.sub || payload.user_id || 'u_api',
          name: displayName,
          email: payload.email || email,
          avatarUrl: payload.user_metadata?.avatar_url || payload.avatar_url || avatarDataUri(displayName),
          role: payload.user_metadata?.role || payload.role || 'admin',
          connectedGithub: githubUsername || payload.connected_github || '',
          connectedVercel: Boolean(payload.connected_vercel),
          connectedNetlify: Boolean(payload.connected_netlify),
        };
        setUser(apiUser);
        setAuditLogs(prev => [{
          id: 'a_' + Math.random().toString(36).substr(2, 9),
          userId: apiUser.id, userName: apiUser.name,
          action: 'USER_LOGIN', details: 'Signed in via Email.',
          createdAt: new Date().toISOString()
        }, ...prev]);
        connectWebSocket(apiUser.id);
        // Use setCurrentPage directly — navigateTo checks user which isn't set yet (React batching)
        setCurrentPage('dashboard');
        return;

      } catch (err: unknown) {
        // Show real error to user — do NOT silently fall to demo mode
        const msg = err instanceof Error ? err.message : 'Login failed. Check your credentials and try again.';
        alert(`Login failed: ${msg}`);
        return;
      }
    }

    // Backend unavailable — no mock logins. The app requires the API server.
    throw new Error('Backend unreachable. Start the API server and try again.');
  };

  const logoutUser = () => {
    // Close WebSocket on logout
    if (wsReconnectTimeoutRef.current) {
      clearTimeout(wsReconnectTimeoutRef.current);
      wsReconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null; // prevent reconnect
      wsRef.current.close();
      wsRef.current = null;
    }

    // Clear JWT
    storageRemove('idp_jwt');
    storageRemove('idp_refresh_token');

    setUser(null);
    setCurrentPage('login');
    storageRemove('idp_user');
    storageRemove('idp_active_project');
    storageRemove('idp_active_deploy');
    storageRemove('idp_active_incident');
  };

  const updateUserConnections = (connections: { github?: string; vercel?: boolean; netlify?: boolean }) => {
    if (!user) return;
    const updated = {
      ...user,
      connectedGithub: connections.github !== undefined ? connections.github : user.connectedGithub,
      connectedVercel: connections.vercel !== undefined ? connections.vercel : user.connectedVercel,
      connectedNetlify: connections.netlify !== undefined ? connections.netlify : user.connectedNetlify,
    };
    setUser(updated);

    const newAudit: AuditLog = {
      id: 'a_' + Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      action: 'UPDATE_CONNECTIONS',
      details: 'Updated integration configurations for provider credentials.',
      createdAt: new Date().toISOString()
    };
    setAuditLogs(prev => [newAudit, ...prev]);
  };

  // Core IDP Actions
  const updateProject = async (id: string, updates: Partial<Project>) => {
    // Optimistic
    setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    if (isApiAvailable()) {
      try {
        const payload: Record<string, unknown> = {};
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.description !== undefined) payload.description = updates.description;
        if (updates.branch !== undefined) payload.branch = updates.branch;
        await api.projects.update(id, payload);
      } catch (err) {
        console.error('[updateProject] API failed:', err);
        // revert
        refreshData();
      }
    }
  };

  const createProject = async (projectData: Omit<Project, 'id' | 'createdAt' | 'ownerId' | 'status' | 'webhookUrl' | 'webhookSecret'>) => {
    if (!user) return;
    const projectId = 'p_' + Math.random().toString(36).substr(2, 9);
    const newProject: Project = {
      ...projectData,
      id: projectId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      ownerId: user.id,
      webhookUrl: '',
      webhookSecret: 'whsec_' + Math.random().toString(36).substr(2, 8),
    };

    if (isApiAvailable()) {
      try {
        const apiProject = await api.projects.create({
          name: projectData.name,
          description: projectData.description,
          repo_owner: projectData.repoOwner,
          repo_name: projectData.repoName,
          branch: projectData.branch,
          provider: projectData.provider,
          vercel_project_id: projectData.vercelProjectId,
          netlify_site_id: projectData.netlifySiteId,
        });
        const merged: Project = {
          ...newProject,
          id: (apiProject.id as string) || projectId,
        };
        setProjects(prev => [...prev, merged]);
        // In API mode: do NOT simulate build pipeline. Real deployments come via webhooks or sync.
        const newAudit: AuditLog = {
          id: 'a_' + Math.random().toString(36).substr(2, 9),
          userId: user.id,
          userName: user.name,
          action: 'PROJECT_CREATE',
          projectId: merged.id,
          projectName: merged.name,
          details: `Created project connected to ${merged.repoOwner}/${merged.repoName} on branch ${merged.branch}.`,
          createdAt: new Date().toISOString()
        };
        setAuditLogs(prev => [newAudit, ...prev]);
        navigateTo('projects');
        return;
      } catch (err) {
        // A failed server create must surface, never silently fall back to local data
        console.error('[createProject] API failed:', err);
        alert('Failed to create project on the server. Please try again.');
        return;
      }
    }

    // Backend unreachable — project creation requires the API server.
    alert('Backend unreachable. Start the API server to create projects.');
    navigateTo('projects');
  };

  const startRollback = async (projectId: string, targetDeploymentId: string) => {
    if (!user) return;
    const project = projects.find(p => p.id === projectId);

    // Rollbacks execute on the backend only.
    if (!isApiAvailable()) {
      alert('Backend unreachable. Start the API server to run rollbacks.');
      return;
    }
    try {
      const result = await api.rollback.start(projectId, targetDeploymentId);
        setNotifications(prev => [{
          id: 'n_' + Math.random().toString(36).substr(2, 9),
          title: 'Rollback Initiated',
          message: `Rollback started for ${project?.name || projectId} (Rollback ID: ${result.rollback_id}).`,
          type: 'info',
          projectId,
          read: false,
          createdAt: new Date().toISOString(),
        }, ...prev]);
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: 'building' } : p));
        setAuditLogs(prev => [{
          id: 'a_' + Math.random().toString(36).substr(2, 9),
          userId: user.id,
          userName: user.name,
          action: 'PROJECT_ROLLBACK',
          projectId,
          projectName: project?.name,
          details: `Rollback initiated via API to deployment ${targetDeploymentId}. Rollback ID: ${result.rollback_id}.`,
          createdAt: new Date().toISOString(),
        }, ...prev]);
        return;
      } catch (err) {
        console.error('[rollback] API call failed:', err);
        alert('Rollback failed on the server. Please try again.');
        return;
      }
  };

  const addComment = async (incidentId: string, content: string) => {
    if (!user) return;

    if (isApiAvailable()) {
      try {
        const result = await api.incidents.comment(incidentId, content);
        const newComment = {
          id: (result as Record<string, unknown>).id as string || 'c_' + Math.random().toString(36).substr(2, 9),
          userId: user.id,
          userName: user.name,
          userAvatar: user.avatarUrl,
          content,
          createdAt: (result as Record<string, unknown>).created_at as string || new Date().toISOString(),
        };
        setIncidents(prev => prev.map(inc => {
          if (inc.id === incidentId) {
            return {
              ...inc,
              comments: [...inc.comments, newComment],
              timeline: [
                ...inc.timeline,
                { event: `Comment added by ${user.name}`, timestamp: new Date().toISOString(), type: 'comment' }
              ]
            };
          }
          return inc;
        }));
        return;
      } catch (err) {
        console.error('[addComment] API failed:', err);
        alert('Failed to post comment on the server. Please try again.');
        return;
      }
    }

    alert('Backend unreachable. Start the API server to post comments.');
  };

  const resolveIncident = async (incidentId: string) => {
    if (!user) return;

    const incident = incidents.find(i => i.id === incidentId);

    if (isApiAvailable()) {
      try {
        await api.incidents.resolve(incidentId);
        setIncidents(prev => prev.map(inc => {
          if (inc.id === incidentId) {
            return {
              ...inc,
              status: 'resolved',
              resolvedAt: new Date().toISOString(),
              timeline: [
                ...inc.timeline,
                { event: `Incident marked as RESOLVED by ${user.name}`, timestamp: new Date().toISOString(), type: 'status_change' }
              ]
            };
          }
          return inc;
        }));
        if (incident) {
          setProjects(prev => prev.map(p => p.id === incident.projectId ? { ...p, status: 'ready' } : p));
          setAuditLogs(prev => [{
            id: 'a_' + Math.random().toString(36).substr(2, 9),
            userId: user.id,
            userName: user.name,
            action: 'INCIDENT_RESOLVE',
            projectId: incident.projectId,
            projectName: incident.projectName,
            details: `Manually marked incident "${incident.title}" as resolved.`,
            createdAt: new Date().toISOString()
          }, ...prev]);
        }
        return;
      } catch (err) {
        console.error('[resolveIncident] API failed:', err);
        alert('Failed to resolve incident on the server. Please try again.');
        return;
      }
    }

    alert('Backend unreachable. Start the API server to resolve incidents.');
  };

  const fetchSecurityIncidents = async () => {
    if (!isApiAvailable() || !user) return;
    try {
      const res = await api.security.list();
      const projectMap = new Map(projects.map(p => [p.id, p.name]));
      const mapped = (res.incidents as Record<string, unknown>[]).map(r => ({
        ...mapRemoteIncident(r),
        projectName: projectMap.get(r.project_id as string) || '',
      }));
      setSecurityIncidents(mapped);
    } catch (err) {
      console.warn('[PlatformContext] fetchSecurityIncidents error:', err);
    }
  };

  const resolveSecurityIncident = async (incidentId: string, notes?: string) => {
    if (!user) return;
    if (isApiAvailable()) {
      try {
        const res = await api.security.resolve(incidentId, notes);
        const updated = mapRemoteIncident(res.incident as Record<string, unknown>);
        setSecurityIncidents(prev => prev.map(i =>
          i.id === incidentId
            ? { ...i, ...updated, projectName: i.projectName, status: 'resolved' as IncidentStatus, resolvedAt: updated.resolvedAt }
            : i
        ));
        setAuditLogs(prev => [{
          id: 'a_' + Math.random().toString(36).substr(2, 9),
          userId: user.id,
          userName: user.name,
          action: 'SECURITY_INCIDENT_RESOLVE',
          details: `Resolved security incident ${incidentId}${notes ? ` — ${notes}` : ''}.`,
          createdAt: new Date().toISOString(),
        }, ...prev]);
        return;
      } catch (err) {
        console.error('[resolveSecurityIncident] API failed:', err);
        return;
      }
    }
    setSecurityIncidents(prev => prev.map(i =>
      i.id === incidentId ? { ...i, status: 'resolved', resolvedAt: new Date().toISOString() } : i
    ));
  };

  const ignoreSecurityIncident = async (incidentId: string, reason: string) => {
    if (!user) return;
    if (isApiAvailable()) {
      try {
        const res = await api.security.ignore(incidentId, reason);
        const updated = mapRemoteIncident(res.incident as Record<string, unknown>);
        setSecurityIncidents(prev => prev.map(i =>
          i.id === incidentId
            ? { ...i, ...updated, projectName: i.projectName, status: 'ignored' as IncidentStatus, ignoredReason: reason }
            : i
        ));
        setAuditLogs(prev => [{
          id: 'a_' + Math.random().toString(36).substr(2, 9),
          userId: user.id,
          userName: user.name,
          action: 'SECURITY_INCIDENT_IGNORE',
          details: `Ignored security incident ${incidentId} (${reason}).`,
          createdAt: new Date().toISOString(),
        }, ...prev]);
        return;
      } catch (err) {
        console.error('[ignoreSecurityIncident] API failed:', err);
        alert('Failed to ignore incident on the server. Please try again.');
        return;
      }
    }

    alert('Backend unreachable. Start the API server to manage security incidents.');
  };

  const markNotificationAsRead = async (notificationId: string) => {
    // Optimistic UI
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));

    if (isApiAvailable()) {
      try {
        await api.notifications.markRead(notificationId);
      } catch (err) {
        console.error('[markNotificationAsRead] API failed:', err);
        // Revert on failure
        setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: false } : n));
      }
    }
  };

  const markAllNotificationsRead = async () => {
    // Optimistic UI
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));

    if (isApiAvailable()) {
      try {
        await api.notifications.markAllRead();
      } catch (err) {
        console.error('[markAllNotificationsRead] API failed:', err);
        refreshData();
      }
    }
  };

  // Webhook Simulator (Crucial for live demonstrations!)
  const triggerWebhookSimulation = (projectId: string, forceStatus?: DeploymentStatus) => {
    if (!user) return;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const commitMessageOptions = [
      'refactor: optimize queries on analytics fetch API',
      'fix: update login button alignment on Safari browser',
      'feat: add multi-language support localized strings files',
      'fix: address race condition on webhook handler response',
      'chore: clean logging filters on database engine init'
    ];

    const randomCommit = commitMessageOptions[Math.floor(Math.random() * commitMessageOptions.length)];
    const commitHash = Math.random().toString(16).substr(2, 7);
    const deployId = 'd_' + Math.random().toString(36).substr(2, 9);
    
    // Choose status: 80% success, 20% fail unless forced
    const endStatus: DeploymentStatus = forceStatus || (Math.random() > 0.2 ? 'ready' : 'failed');
    
    // Calculate new version string
    const currentDeployments = deployments.filter(d => d.projectId === projectId);
    let nextVersion = 'v1.0.1';
    if (currentDeployments.length > 0) {
      const latestVer = currentDeployments[0].version; // deployments are prepended
      const match = latestVer.match(/v(\d+)\.(\d+)\.(\d+)/);
      if (match) {
        const major = parseInt(match[1]);
        const minor = parseInt(match[2]);
        const patch = parseInt(match[3]) + 1;
        nextVersion = `v${major}.${minor}.${patch}`;
      }
    }

    const newDeploy: Deployment = {
      id: deployId,
      projectId: projectId,
      projectName: project.name,
      version: nextVersion,
      status: 'queued',
      commitHash: commitHash,
      commitMessage: randomCommit,
      branch: project.branch,
      author: 'David Kim',
      authorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=80&h=80&q=80',
      provider: project.provider,
      durationMs: 0,
      createdAt: new Date().toISOString(),
      stages: [
        { name: 'Fetch Sources', status: 'running', durationMs: 0 },
        { name: 'Dependency Resolution', status: 'pending', durationMs: 0 },
        { name: 'Build Execution', status: 'pending', durationMs: 0 },
        { name: 'Edge Deployment Routing', status: 'pending', durationMs: 0 },
      ],
      logs: [`Push webhook received from GitHub for branch ${project.branch}...`, 'Queueing worker tasks...']
    };

    setDeployments(prev => [newDeploy, ...prev]);
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: 'queued' } : p));

    // Audit webhook event receipt
    setAuditLogs(prev => [{
      id: 'a_' + Math.random().toString(36).substr(2, 9),
      userId: 'system',
      userName: 'GitHub Webhook Broker',
      action: 'WEBHOOK_RECEIVED',
      projectId: projectId,
      projectName: project.name,
      details: `Received push event for commit ${commitHash} on branch ${project.branch}.`,
      createdAt: new Date().toISOString()
    }, ...prev]);

    // Build transitions
    setTimeout(() => {
      setDeployments(prev => prev.map(d => {
        if (d.id === deployId) {
          return {
            ...d,
            status: 'building',
            stages: d.stages?.map((s, idx) => 
              idx === 0 ? { ...s, status: 'success', durationMs: 2000 } :
              idx === 1 ? { ...s, status: 'running' } : s
            ),
            logs: [...(d.logs || []), 'Workspace cloned.', 'Running dependency verification audits.']
          };
        }
        return d;
      }));
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: 'building' } : p));
    }, 2000);

    setTimeout(() => {
      setDeployments(prev => prev.map(d => {
        if (d.id === deployId) {
          if (endStatus === 'ready') {
            return {
              ...d,
              status: 'ready',
              durationMs: 52000,
              url: `https://${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${commitHash}.${project.provider === 'vercel' ? 'vercel.app' : 'netlify.app'}`,
              stages: d.stages?.map(s => ({ ...s, status: 'success', durationMs: 12000 })),
              logs: [...(d.logs || []), 'All unit tests passed. [142 tests verified]', 'Compiler packaging assets finished.', 'Traffic routes redirected.', 'Live URL: ' + `https://${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${commitHash}.${project.provider === 'vercel' ? 'vercel.app' : 'netlify.app'}`]
            };
          } else {
            return {
              ...d,
              status: 'failed',
              durationMs: 31000,
              errorMessage: project.provider === 'vercel' 
                ? 'Execution Error: Environment variable mismatch. Missing DATABASE_URL.'
                : 'Build Failed: TypeScript validation compilation failed.',
              stages: [
                { name: 'Fetch Sources', status: 'success', durationMs: 2000 },
                { name: 'Dependency Resolution', status: 'success', durationMs: 8000 },
                { name: 'Build Execution', status: 'failed', durationMs: 21000 },
                { name: 'Edge Deployment Routing', status: 'pending', durationMs: 0 },
              ],
              logs: [...(d.logs || []), 'Compiler found syntactic faults.', 'Deployment rejected by hosting service provider rules.']
            };
          }
        }
        return d;
      }));

      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: endStatus } : p));

      if (endStatus === 'failed') {
        const incidentId = 'inc_' + Math.random().toString(36).substr(2, 9);
        const newIncident: Incident = {
          id: incidentId,
          projectId: projectId,
          projectName: project.name,
          deploymentId: deployId,
          severity: forceStatus === 'failed' ? 'critical' : 'high',
          provider: project.provider,
          title: project.provider === 'vercel' 
            ? 'Production Gateway Environment Configuration Mismatch'
            : 'TS Compilation Failure in Static Routing Module',
          description: `The push webhook deployment failed during compilation. Commit msg: "${randomCommit}". Service is showing unhealthy state on Edge CDN nodes.`,
          status: 'open',
          createdAt: new Date().toISOString(),
          comments: [],
          suggestedAction: project.provider === 'vercel' 
            ? 'Set the necessary DATABASE_URL credentials inside Settings.'
            : 'Fix syntax errors inside TicketQueue components.',
          timeline: [
            { event: 'Webhook deployment failed', timestamp: new Date().toISOString(), type: 'alert' },
            { event: 'Incident automatically opened by webhook checker', timestamp: new Date().toISOString(), type: 'alert' }
          ]
        };

        // Seed details into AI explanation registry dynamically
        aiExplanations[deployId] = project.provider === 'vercel' ? aiExplanations['d501'] : aiExplanations['d201'];

        setIncidents(prev => [newIncident, ...prev]);

        setNotifications(prev => [
          {
            id: 'n_' + Math.random().toString(36).substr(2, 9),
            title: 'Critical Deployment Failure',
            message: `Push event for ${project.name} failed compile routines. Incident tickets opened.`,
            type: 'incident',
            projectId: projectId,
            incidentId: incidentId,
            deploymentId: deployId,
            read: false,
            createdAt: new Date().toISOString()
          },
          ...prev
        ]);
      } else {
        setNotifications(prev => [
          {
            id: 'n_' + Math.random().toString(36).substr(2, 9),
            title: 'Pipeline Ready',
            message: `Push event for ${project.name} built and deployed. Running v${nextVersion}.`,
            type: 'success',
            projectId: projectId,
            deploymentId: deployId,
            read: false,
            createdAt: new Date().toISOString()
          },
          ...prev
        ]);
      }
    }, 5000);
  };

  const updateIncident = async (incidentId: string, updates: Partial<Incident>) => {
    // Optimistic UI
    setIncidents(prev => prev.map(i => i.id === incidentId ? { ...i, ...updates } : i));

    if (isApiAvailable()) {
      try {
        const apiPayload: Record<string, unknown> = {};
        if (updates.status !== undefined) apiPayload.status = updates.status;
        if (updates.severity !== undefined) apiPayload.severity = updates.severity;
        if (updates.assignedTo !== undefined) apiPayload.assigned_to = updates.assignedTo;
        if (updates.description !== undefined) apiPayload.description = updates.description;
        if (updates.suggestedAction !== undefined) apiPayload.suggested_action = updates.suggestedAction;
        await api.incidents.update(incidentId, apiPayload);
      } catch (err) {
        console.error('[updateIncident] API failed:', err);
        refreshData();
      }
    }

    if (user) {
      setAuditLogs(prev => [{
        id: 'a_' + Math.random().toString(36).substr(2, 9),
        userId: user.id,
        userName: user.name,
        action: 'INCIDENT_UPDATE',
        details: `Updated incident ${incidentId} with fields: ${Object.keys(updates).join(', ')}.`,
        createdAt: new Date().toISOString()
      }, ...prev]);
    }
  };

  // Team Management Actions
  const addTeamMember = async (member: Omit<TeamMember, 'id' | 'addedAt' | 'addedBy'>) => {
    if (!user) return;

    if (isApiAvailable()) {
      try {
        const remote = await api.team.add({
          project_id: member.projectId,
          email: member.email,
          role: member.role,
          name: member.name,
        });
        const mapped = mapRemoteTeamMember(remote as Record<string, unknown>);
        setTeamMembers(prev => {
          const next = prev.filter(tm => tm.email !== member.email || tm.projectId !== member.projectId);
          return [...next, mapped];
        });

        // Create invite notification so the invited user sees it in their inbox
        const project = projects.find(p => p.id === member.projectId);
        const inviteNotification: Notification = {
          id: 'n_' + Math.random().toString(36).substr(2, 9),
          title: 'Team Invitation',
          message: `${user.name} invited you to join "${project?.name || 'a project'}" as ${member.role}.`,
          type: 'team_invite',
          projectId: member.projectId,
          teamMemberId: mapped.id,
          read: false,
          createdAt: new Date().toISOString(),
        };
        setNotifications(prev => [inviteNotification, ...prev]);
      } catch (err) {
        console.error('[Team] addTeamMember API error:', err);
        throw err;
      }
      return;
    }

    const newMember: TeamMember = {
      ...member,
      id: 'tm_' + Math.random().toString(36).substr(2, 9),
      addedAt: new Date().toISOString(),
      addedBy: user.id,
      status: 'invited',
    };
    setTeamMembers(prev => [...prev, newMember]);

    // Create invite notification for the invited user
    const project = projects.find(p => p.id === member.projectId);
    const inviteNotification: Notification = {
      id: 'n_' + Math.random().toString(36).substr(2, 9),
      title: 'Team Invitation',
      message: `${user.name} invited you to join "${project?.name || 'a project'}" as ${member.role}.`,
      type: 'team_invite',
      projectId: member.projectId,
      teamMemberId: newMember.id,
      read: false,
      createdAt: new Date().toISOString(),
    };
    setNotifications(prev => [inviteNotification, ...prev]);

    const newAudit: AuditLog = {
      id: 'a_' + Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      action: 'TEAM_MEMBER_ADD',
      details: `Added team member ${newMember.name} (${newMember.email}) with role ${newMember.role}.`,
      createdAt: new Date().toISOString(),
    };
    setAuditLogs(prev => [newAudit, ...prev]);
  };

  const acceptTeamInvite = async (teamMemberId: string, notificationId: string, inviteToken?: string) => {
    if (isApiAvailable()) {
      // The token is required by the backend. Usually it comes from the
      // InviteBanner (pendingInvites) but the Notifications page may only know
      // teamMemberId — fall back to the cached pending-invite token.
      const token = inviteToken || pendingInvites.find(i => i.id === teamMemberId)?.inviteToken;
      if (!token) {
        const err = new Error('Missing invite token. Refresh the page and try again.');
        console.error('[Team] acceptTeamInvite error:', err);
        throw err;
      }
      try {
        await api.team.acceptInvite(teamMemberId, token);
      } catch (err) {
        console.error('[Team] acceptTeamInvite API error:', err);
        throw err;
      }
      // Refresh immediately so the shared project, the updated teamMembers list
      // and the marked-read notification are all visible right away (not after
      // the next 30s/60s poll) and the invite banner disappears.
      await Promise.all([refreshData(), refreshPendingInvites()]);
    }
    // Always update local state (demo mode + optimistic update in API mode)
    setTeamMembers(prev =>
      prev.map(tm => tm.id === teamMemberId ? { ...tm, status: 'accepted' as const } : tm)
    );
    setPendingInvites(prev => prev.filter(tm => tm.id !== teamMemberId));
    if (notificationId) {
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
    }
    // Also clear every invite notification pointing at this team member so the
    // bell doesn't keep an Accept/Decline button for an already-handled invite.
    setNotifications(prev => prev.map(n => n.teamMemberId === teamMemberId ? { ...n, read: true } : n));
  };

  const declineTeamInvite = async (teamMemberId: string, notificationId: string, inviteToken?: string) => {
    if (isApiAvailable()) {
      const token = inviteToken || pendingInvites.find(i => i.id === teamMemberId)?.inviteToken;
      if (!token) {
        const err = new Error('Missing invite token. Refresh the page and try again.');
        console.error('[Team] declineTeamInvite error:', err);
        throw err;
      }
      try {
        await api.team.declineInvite(teamMemberId, token);
      } catch (err) {
        console.error('[Team] declineTeamInvite API error:', err);
        throw err;
      }
      await Promise.all([refreshData(), refreshPendingInvites()]);
    }
    setTeamMembers(prev =>
      prev.map(tm => tm.id === teamMemberId ? { ...tm, status: 'declined' as const } : tm)
    );
    setPendingInvites(prev => prev.filter(tm => tm.id !== teamMemberId));
    if (notificationId) {
      setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
    }
    // Also clear every invite notification pointing at this team member so the
    // bell doesn't keep an Accept/Decline button for an already-handled invite.
    setNotifications(prev => prev.map(n => n.teamMemberId === teamMemberId ? { ...n, read: true } : n));
  };

  const removeTeamMember = async (memberId: string) => {
    if (isApiAvailable()) {
      try {
        await api.team.remove(memberId);
      } catch (err) {
        console.error('[Team] removeTeamMember API error:', err);
        throw err;
      }
    }
    if (!user) return;
    const member = teamMembers.find(tm => tm.id === memberId);
    setTeamMembers(prev => prev.filter(tm => tm.id !== memberId));

    if (member) {
      const newAudit: AuditLog = {
        id: 'a_' + Math.random().toString(36).substr(2, 9),
        userId: user.id,
        userName: user.name,
        action: 'TEAM_MEMBER_REMOVE',
        details: `Removed team member ${member.name} from project.`,
        createdAt: new Date().toISOString(),
      };
      setAuditLogs(prev => [newAudit, ...prev]);
    }
  };

  const updateTeamMemberRole = async (memberId: string, role: ProjectRole) => {
    if (isApiAvailable()) {
      try {
        await api.team.updateRole(memberId, role);
      } catch (err) {
        console.error('[Team] updateTeamMemberRole API error:', err);
        throw err;
      }
    }
    if (!user) return;
    const member = teamMembers.find(tm => tm.id === memberId);
    setTeamMembers(prev => prev.map(tm => tm.id === memberId ? { ...tm, role } : tm));

    if (member) {
      const newAudit: AuditLog = {
        id: 'a_' + Math.random().toString(36).substr(2, 9),
        userId: user.id,
        userName: user.name,
        action: 'TEAM_MEMBER_ROLE_UPDATE',
        details: `Updated role for ${member.name} to ${role}.`,
        createdAt: new Date().toISOString(),
      };
      setAuditLogs(prev => [newAudit, ...prev]);
    }
  };

  // Plugin Actions
  const installPlugin = (pluginId: string) => {
    if (!user) return;
    const def = pluginDefinitions.find(d => d.id === pluginId);
    if (!def) return;

    const tempId = 'inst_' + Math.random().toString(36).substr(2, 9);
    const newInst: PluginInstallation = {
      id: tempId,
      pluginId,
      pluginName: def.name,
      category: def.category,
      status: 'disconnected',
      installedAt: new Date().toISOString(),
      installedById: user.id,
      enabledForProjects: [],
      recentEvents: [{ message: 'Plugin installed. Configure credentials to connect.', timestamp: new Date().toISOString(), type: 'info' }],
    };
    setPluginInstallations(prev => [...prev, newInst]);

    if (isApiAvailable()) {
      api.plugins.create({
        plugin_id: pluginId,
        plugin_name: def.name,
        category: def.category,
        status: 'disconnected',
      }).then(res => {
        if (res && (res as Record<string, unknown>).id) {
          const rec = res as Record<string, unknown>;
          setPluginInstallations(prev => prev.map(p => p.id === tempId ? { ...p, id: rec.id as string } : p));
        }
      }).catch(err => console.error('[plugins] Create failed:', err));
    }

    const newAudit: AuditLog = {
      id: 'a_' + Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      action: 'PLUGIN_INSTALL',
      details: `Installed plugin: ${def.name}. Awaiting credential configuration.`,
      createdAt: new Date().toISOString(),
    };
    setAuditLogs(prev => [newAudit, ...prev]);

    setNotifications(prev => [{
      id: 'n_' + Math.random().toString(36).substr(2, 9),
      title: 'Plugin Installed',
      message: `${def.name} plugin installed. Configure credentials in Integrations to connect.`,
      type: 'info',
      read: false,
      createdAt: new Date().toISOString(),
    }, ...prev]);
  };

  const uninstallPlugin = (installationId: string) => {
    if (!user) return;
    const inst = pluginInstallations.find(p => p.id === installationId);
    if (!inst) return;

    setPluginInstallations(prev => prev.filter(p => p.id !== installationId));

    if (isApiAvailable()) {
      api.plugins.remove(installationId).catch(err => console.error('[plugins] Remove failed:', err));
    }

    const newAudit: AuditLog = {
      id: 'a_' + Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      action: 'PLUGIN_REMOVE',
      details: `Removed plugin: ${inst.pluginName}. Webhooks deregistered.`,
      createdAt: new Date().toISOString(),
    };
    setAuditLogs(prev => [newAudit, ...prev]);
  };

  const updatePluginConfig = async (installationId: string, config: Partial<PluginInstallation> & { apiKey?: string }) => {
    if (!user) return;

    // Optimistic UI update
    setPluginInstallations(prev => prev.map(p => {
      if (p.id !== installationId) return p;
      const updated = { ...p, ...config };
      if (config.apiKey || config.apiKeyHint) {
        updated.status = 'connected';
        updated.lastSyncAt = new Date().toISOString();
        updated.errorMessage = undefined;
      }
      return updated;
    }));

    // Persist to Supabase via backend
    if (isApiAvailable()) {
      try {
        const payload: Record<string, unknown> = {};
        if (config.apiKey !== undefined && config.apiKey !== '' && !config.apiKey.includes('••••')) {
          payload.api_key = config.apiKey;
        }
        if (config.apiKeyHint !== undefined && !config.apiKeyHint.includes('••••')) {
          payload.api_key_hint = config.apiKeyHint;
        }
        if (config.status !== undefined) payload.status = config.status;
        if (config.enabledForProjects !== undefined) payload.enabled_for_projects = config.enabledForProjects;
        if (config.baseUrl !== undefined) payload.base_url = config.baseUrl;
        if (config.projectSelector !== undefined) payload.project_selector = config.projectSelector;
        if (config.configData !== undefined) payload.config_data = config.configData;
        if (config.apiKey) payload.status = 'connected';

        if (Object.keys(payload).length > 0) {
          const updated = await api.plugins.update(installationId, payload);
          if (updated && (updated as Record<string, unknown>).id) {
            const serverPlugin = updated as Record<string, unknown>;
            setPluginInstallations(prev => prev.map(p => (p.id === installationId || p.id === serverPlugin.id) ? {
              ...p,
              id: (serverPlugin.id as string) || p.id,
              status: (serverPlugin.status as PluginInstallation['status']) || p.status,
              apiKeyHint: (serverPlugin.api_key_hint as string) || p.apiKeyHint,
              baseUrl: (serverPlugin.base_url as string) || p.baseUrl,
              projectSelector: (serverPlugin.project_selector as string) || p.projectSelector,
              lastSyncAt: p.lastSyncAt || new Date().toISOString(),
            } : p));
          }
        }
        // Auto refresh platform data after saving plugin config
        await refreshData();
      } catch (err) {
        console.error('[plugins] Failed to persist config to backend:', err);
      }
    }

    const inst = pluginInstallations.find(p => p.id === installationId);
    const newAudit: AuditLog = {
      id: 'a_' + Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      action: 'PLUGIN_UPDATE',
      details: `Updated configuration for plugin: ${inst ? inst.pluginName : installationId}`,
      createdAt: new Date().toISOString(),
    };
    setAuditLogs(prev => [newAudit, ...prev]);

    setNotifications(prev => [{
      id: 'n_' + Math.random().toString(36).substr(2, 9),
      title: 'Plugin Updated',
      message: `Configuration for ${inst ? inst.pluginName : 'plugin'} saved successfully.`,
      type: 'info',
      read: false,
      createdAt: new Date().toISOString(),
    }, ...prev]);
  };

  return (
    <PlatformContext.Provider value={{
      user,
      authReady,
      projects,
      deployments,
      incidents,
      securityIncidents,
      rollbackOperations,
      notifications,
      auditLogs,
      pluginInstallations,
      monitoringAlerts,
      sentryIssues,
      currentPage,
      activeProjectId,
      activeDeploymentId,
      activeIncidentId,
      activePluginId,
      activeSettingsCard,
      navigateTo,
      loginUser,
      logoutUser,
      updateUserConnections,
      createProject,
      updateProject,
      startRollback,
      addComment,
      resolveIncident,
      updateIncident,
      fetchSecurityIncidents,
      resolveSecurityIncident,
      ignoreSecurityIncident,
      markNotificationAsRead,
      markAllNotificationsRead,
      installPlugin,
      uninstallPlugin,
      updatePluginConfig,
      refreshData,
      syncDeployments,
      teamMembers,
      addTeamMember,
      removeTeamMember,
      updateTeamMemberRole,
      acceptTeamInvite,
      declineTeamInvite,
      pendingInvites,
      refreshPendingInvites,
      triggerWebhookSimulation,
      theme,
      setTheme
    }}>
      {children}
    </PlatformContext.Provider>
  );
};

export const usePlatform = () => {
  const context = useContext(PlatformContext);
  if (context === undefined) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  return context;
};
