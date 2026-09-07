import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { api, isApiAvailable } from '../services/api';
import type { 
  Project, Deployment, Incident, RollbackOperation, Notification, AuditLog, User,
  DeploymentStatus, IncidentStatus, IncidentSeverity, ProviderType, EnvironmentType,
  PluginInstallation, MonitoringAlert, SentryIssue, TeamMember, ProjectRole
} from '../types/platform';
import { 
  currentUser as initialUser,
  initialProjects,
  initialDeployments,
  initialIncidents,
  initialRollbackOperations,
  initialNotifications,
  initialAuditLogs,
  aiExplanations,
  initialPluginInstallations,
  initialMonitoringAlerts,
  initialSentryIssues,
  pluginDefinitions,
  initialTeamMembers
} from '../data/seedData';

type PageType = 
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
  | 'login';

interface PlatformContextProps {
  user: User | null;
  projects: Project[];
  deployments: Deployment[];
  incidents: Incident[];
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
  
  // Navigation
  navigateTo: (page: PageType, contextIds?: { projectId?: string; deploymentId?: string; incidentId?: string; pluginId?: string }) => void;
  
  // Auth Actions
  loginUser: (email: string, provider?: string) => void;
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

  // Team Management
  teamMembers: TeamMember[];
  addTeamMember: (member: Omit<TeamMember, 'id' | 'addedAt' | 'addedBy'>) => void;
  removeTeamMember: (memberId: string) => void;
  updateTeamMemberRole: (memberId: string, role: ProjectRole) => void;

  // Webhook Simulator
  triggerWebhookSimulation: (projectId: string, forceStatus?: DeploymentStatus) => void;
}

const PlatformContext = createContext<PlatformContextProps | undefined>(undefined);

export const PlatformProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // In API mode, wipe stale seed data from localStorage on startup so it never shows.
  // This runs once synchronously before any state is initialized.
  if (import.meta.env.VITE_API_URL && !localStorage.getItem('idp_jwt')) {
    const seedKeys = [
      'idp_projects', 'idp_deployments', 'idp_incidents', 'idp_rollbacks',
      'idp_notifications', 'idp_audit', 'idp_plugins', 'idp_alerts',
    ];
    seedKeys.forEach(k => localStorage.removeItem(k));
  }

  // Helper: in API mode, always start empty (no seed data)
  const isApiMode = Boolean(import.meta.env.VITE_API_URL);
  const hasJwt = Boolean(localStorage.getItem('idp_jwt'));

  // Load initial states from localStorage if available, else use seed data
  const [user, setUser] = useState<User | null>(() => {
    // Only restore user if we have a valid JWT token (API mode)
    // or if we're in demo mode (no VITE_API_URL)
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl) {
      // API mode — only restore if JWT exists and looks valid
      const jwt = localStorage.getItem('idp_jwt');
      if (!jwt) return null; // No token → go to login
      // Basic JWT expiry check (decode payload, check exp)
      try {
        const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        if (payload.exp && payload.exp * 1000 < Date.now()) {
          // Token expired — clear and go to login
          localStorage.removeItem('idp_jwt');
          localStorage.removeItem('idp_user');
          return null;
        }
        // Token valid — restore user
        const saved = localStorage.getItem('idp_user');
        if (saved) {
          try { return JSON.parse(saved); } catch { return null; }
        }
        return null;
      } catch {
        localStorage.removeItem('idp_jwt');
        localStorage.removeItem('idp_user');
        return null;
      }
    }
    // Demo mode — restore from localStorage
    const saved = localStorage.getItem('idp_user');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return null;
  });

  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('idp_projects');
    if (isApiMode) return saved ? JSON.parse(saved) : [];
    return saved ? JSON.parse(saved) : initialProjects;
  });

  const [deployments, setDeployments] = useState<Deployment[]>(() => {
    const saved = localStorage.getItem('idp_deployments');
    if (isApiMode) return saved ? JSON.parse(saved) : [];
    return saved ? JSON.parse(saved) : initialDeployments;
  });

  const [incidents, setIncidents] = useState<Incident[]>(() => {
    const saved = localStorage.getItem('idp_incidents');
    if (isApiMode) return saved ? JSON.parse(saved) : [];
    return saved ? JSON.parse(saved) : initialIncidents;
  });

  const [rollbackOperations, setRollbackOperations] = useState<RollbackOperation[]>(() => {
    const saved = localStorage.getItem('idp_rollbacks');
    if (isApiMode) return saved ? JSON.parse(saved) : [];
    return saved ? JSON.parse(saved) : initialRollbackOperations;
  });

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem('idp_notifications');
    if (isApiMode) return saved ? JSON.parse(saved) : [];
    return saved ? JSON.parse(saved) : initialNotifications;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem('idp_audit');
    if (isApiMode) return saved ? JSON.parse(saved) : [];
    return saved ? JSON.parse(saved) : initialAuditLogs;
  });

  const [pluginInstallations, setPluginInstallations] = useState<PluginInstallation[]>(() => {
    const saved = localStorage.getItem('idp_plugins');
    if (isApiMode) return saved ? JSON.parse(saved) : [];
    return saved ? JSON.parse(saved) : initialPluginInstallations;
  });

  const [monitoringAlerts, setMonitoringAlerts] = useState<MonitoringAlert[]>(() => {
    const saved = localStorage.getItem('idp_alerts');
    if (isApiMode) return saved ? JSON.parse(saved) : [];
    return saved ? JSON.parse(saved) : initialMonitoringAlerts;
  });

  const [sentryIssues] = useState<SentryIssue[]>(() => isApiMode ? [] : initialSentryIssues);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(() => {
    const saved = localStorage.getItem('idp_team');
    return saved ? JSON.parse(saved) : initialTeamMembers;
  });

  // Navigation Context
  const [currentPage, setCurrentPage] = useState<PageType>(() => {
    // Only restore page if we have a valid JWT (API mode) or saved user (demo mode)
    const jwt = localStorage.getItem('idp_jwt');
    const apiUrl = import.meta.env.VITE_API_URL;
    const savedPage = localStorage.getItem('idp_page') as PageType;
    if (apiUrl) {
      // API mode — only restore page if JWT exists
      if (jwt && savedPage && savedPage !== 'login') return savedPage;
      return 'login';
    }
    // Demo mode — restore if saved user exists
    const savedUser = localStorage.getItem('idp_user');
    if (savedUser && savedUser !== 'null' && savedPage && savedPage !== 'login') return savedPage;
    return 'login';
  });

  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    return localStorage.getItem('idp_active_project');
  });

  const [activeDeploymentId, setActiveDeploymentId] = useState<string | null>(() => {
    return localStorage.getItem('idp_active_deploy');
  });

  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(() => {
    return localStorage.getItem('idp_active_incident');
  });

  const [activePluginId, setActivePluginId] = useState<string | null>(() => {
    return localStorage.getItem('idp_active_plugin');
  });

  // WebSocket ref for real-time updates
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsReconnectDelayRef = useRef<number>(1000);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem('idp_user', JSON.stringify(user));
  }, [user]);

  useEffect(() => {
    localStorage.setItem('idp_projects', JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    localStorage.setItem('idp_deployments', JSON.stringify(deployments));
  }, [deployments]);

  useEffect(() => {
    localStorage.setItem('idp_incidents', JSON.stringify(incidents));
  }, [incidents]);

  useEffect(() => {
    localStorage.setItem('idp_rollbacks', JSON.stringify(rollbackOperations));
  }, [rollbackOperations]);

  useEffect(() => {
    localStorage.setItem('idp_notifications', JSON.stringify(notifications));
  }, [notifications]);

  useEffect(() => {
    localStorage.setItem('idp_audit', JSON.stringify(auditLogs));
  }, [auditLogs]);

  useEffect(() => {
    localStorage.setItem('idp_plugins', JSON.stringify(pluginInstallations));
  }, [pluginInstallations]);

  useEffect(() => {
    localStorage.setItem('idp_alerts', JSON.stringify(monitoringAlerts));
  }, [monitoringAlerts]);

  useEffect(() => {
    localStorage.setItem('idp_team', JSON.stringify(teamMembers));
  }, [teamMembers]);

  useEffect(() => {
    localStorage.setItem('idp_page', currentPage);
  }, [currentPage]);

  // Fix 2: After restoring user from JWT on page load, navigate away from login
  useEffect(() => {
    if (user && currentPage === 'login') {
      setCurrentPage('dashboard');
    }
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

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
  });

  const mapRemoteDeployment = (r: Record<string, unknown>, projectName?: string): Deployment => ({
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
  });

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
    };
  };

  const mapRemoteAuditLog = (r: Record<string, unknown>): AuditLog => ({
    id: r.id as string,
    userId: (r.user_id as string) || '',
    userName: (r.user_name as string) || 'System',
    action: (r.action as string) || '',
    projectId: r.project_id as string | undefined,
    details: (r.details as string) || '',
    createdAt: (r.created_at as string) || new Date().toISOString(),
  });

  // Refresh live data from API
  const refreshData = async () => {
    if (!isApiAvailable() || !user) return;
    try {
      const [remoteProjects, remoteIncidents, remoteNotifications, remoteDeployments, remoteAlerts, remotePlugins, remoteAudit] = await Promise.all([
        api.projects.list().catch(() => null),
        api.incidents.list().catch(() => null),
        api.notifications.list().catch(() => null),
        api.deployments.list().catch(() => null),
        api.monitoring.getAlerts().catch(() => null),
        api.plugins.list().catch(() => null),
        api.audit.list(50).catch(() => null),
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

      if (remoteNotifications) setNotifications(remoteNotifications as Notification[]);
      if (remoteAlerts) setMonitoringAlerts((remoteAlerts as Record<string, unknown>[]).map(mapRemoteAlert));
      if (remotePlugins) setPluginInstallations((remotePlugins as Record<string, unknown>[]).map(mapRemotePlugin));
      if (remoteAudit) setAuditLogs((remoteAudit as Record<string, unknown>[]).map(mapRemoteAuditLog));
    } catch (err) {
      console.warn('[PlatformContext] refreshData error:', err);
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
    ['idp_projects','idp_incidents','idp_notifications','idp_deployments','idp_plugins','idp_alerts','idp_audit'].forEach(k => localStorage.removeItem(k));
    refreshData();

    const interval = setInterval(refreshData, 10000);
    return () => clearInterval(interval);
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Navigation Helper
  const navigateTo = (page: PageType, contextIds?: { projectId?: string; deploymentId?: string; incidentId?: string; pluginId?: string }) => {
    if (contextIds?.projectId) {
      setActiveProjectId(contextIds.projectId);
      localStorage.setItem('idp_active_project', contextIds.projectId);
    }
    if (contextIds?.deploymentId) {
      setActiveDeploymentId(contextIds.deploymentId);
      localStorage.setItem('idp_active_deploy', contextIds.deploymentId);
    }
    if (contextIds?.incidentId) {
      setActiveIncidentId(contextIds.incidentId);
      localStorage.setItem('idp_active_incident', contextIds.incidentId);
    }
    if (contextIds?.pluginId) {
      setActivePluginId(contextIds.pluginId);
      localStorage.setItem('idp_active_plugin', contextIds.pluginId);
    }
    
    // Auto-login check
    if (!user && page !== 'login') {
      setCurrentPage('login');
    } else {
      setCurrentPage(page);
    }
  };

  // WebSocket connection helper with exponential backoff
  const connectWebSocket = (userId: string) => {
    const wsUrl = import.meta.env.VITE_WS_URL;
    if (!wsUrl) return;

    // Clear any pending reconnect timer
    if (wsReconnectTimeoutRef.current) {
      clearTimeout(wsReconnectTimeoutRef.current);
      wsReconnectTimeoutRef.current = null;
    }

    const ws = new WebSocket(`${wsUrl}/ws/${userId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as { type: string; data: Record<string, unknown> };
        switch (msg.type) {
          case 'deployment.status_changed':
            setDeployments(prev =>
              prev.map(d => d.id === msg.data.id ? { ...d, ...(msg.data as Partial<Deployment>) } : d)
            );
            break;
          case 'incident.created':
            setIncidents(prev => [msg.data as Incident, ...prev]);
            break;
          case 'rollback.progress':
            setRollbackOperations(prev =>
              prev.map(r => r.id === msg.data.id ? { ...r, ...(msg.data as Partial<RollbackOperation>) } : r)
            );
            break;
          case 'notification.new':
            setNotifications(prev => [msg.data as Notification, ...prev]);
            break;
          default:
            break;
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      // Exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s cap
      const delay = Math.min(wsReconnectDelayRef.current, 30000);
      wsReconnectTimeoutRef.current = setTimeout(() => {
        wsReconnectDelayRef.current = Math.min(delay * 2, 30000);
        connectWebSocket(userId);
      }, delay);
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

    if (isApiAvailable()) {
      // API mode — real authentication only, no demo fallback
      try {
        if (isGoogle) {
          alert('Google login is not configured yet. Please use email/password or GitHub.');
          return;
        }

        // ── GitHub OAuth callback — token + user info packed into email param ──
        if (isGitHubOAuth) {
          // Format: __oauth__<jwt>__<email>__<name>__<avatar>__<username>__<ghToken>
          const parts = email.split('__');
          // parts: ['', 'oauth', jwt, email, name, avatar, username, ghToken]
          const jwt = parts[2] || '';
          const ghEmail = parts[3] || '';
          const ghName = parts[4] || 'Developer';
          const ghAvatar = parts[5] || '';
          const ghUsername = parts[6] || '';
          const ghToken = parts[7] || '';

          if (!jwt) {
            alert('GitHub OAuth failed — no token received. Please try again.');
            return;
          }

          const oauthUser: User = {
            id: 'gh_oauth_' + ghUsername,
            name: ghName,
            email: ghEmail,
            avatarUrl: ghAvatar || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80',
            role: 'admin',
            connectedGithub: ghUsername,
            connectedVercel: false,
            connectedNetlify: false,
          };

          localStorage.setItem('idp_jwt', jwt);
          setUser(oauthUser);

          // Fetch repos and set up GitHub plugin in background
          if (ghToken) {
            try {
              const setup = await api.auth.githubSetup(ghToken);
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
                    ownerId: oauthUser.id,
                  }));
                if (newProjects.length > 0) {
                  setProjects(prev => [...newProjects, ...prev]);
                }
              }
            } catch {
              // Setup is best-effort — login still succeeds
            }
          }

          setAuditLogs(prev => [{
            id: 'a_' + Math.random().toString(36).substr(2, 9),
            userId: oauthUser.id, userName: oauthUser.name,
            action: 'USER_LOGIN',
            details: 'Signed in via GitHub OAuth. GitHub integration auto-configured.',
            createdAt: new Date().toISOString()
          }, ...prev]);
          connectWebSocket(oauthUser.id);
          navigateTo('dashboard');
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
            avatarUrl: ghResult.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80',
            role: (ghResult.user.role as 'admin' | 'developer' | 'operator') || 'admin',
            connectedGithub: ghResult.github_username || 'connected',
            connectedVercel: false,
            connectedNetlify: false,
          };
          localStorage.setItem('idp_jwt', ghResult.access_token);
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
          navigateTo('dashboard');
          return;
        }

        // Email + password login
        const result = await api.auth.login(email, passwordOrProvider || '') as { access_token: string };
        const token = result.access_token;
        localStorage.setItem('idp_jwt', token);

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
          avatarUrl: payload.user_metadata?.avatar_url || payload.avatar_url || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80',
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
        navigateTo('dashboard');
        return;

      } catch (err: unknown) {
        // Show real error to user — do NOT silently fall to demo mode
        const msg = err instanceof Error ? err.message : 'Login failed. Check your credentials and try again.';
        alert(`Login failed: ${msg}`);
        return;
      }
    }

    // ── Demo / mock mode (only when VITE_API_URL is not set) ────────────────
    const isGitHubDemo = passwordOrProvider === 'GitHub';
    const isGoogleDemo = passwordOrProvider === 'Google';
    const mockName = isGitHubDemo
      ? 'Developer'
      : (email.split('@')[0] || 'Developer');

    const mockUser: User = {
      id: 'u_' + Math.random().toString(36).substr(2, 9),
      name: mockName,
      email: isGitHubDemo ? 'demo@localhost' : (email || 'demo@localhost'),
      avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80',
      role: 'admin',
      connectedGithub: isGitHubDemo ? 'connected' : '',
      connectedVercel: false,
      connectedNetlify: false,
    };
    setUser(mockUser);

    // Create login audit event
    const newAudit: AuditLog = {
      id: 'a_' + Math.random().toString(36).substr(2, 9),
      userId: mockUser.id,
      userName: mockUser.name,
      action: 'USER_LOGIN',
      details: `Logged in securely via ${isGitHubDemo ? 'GitHub' : isGoogleDemo ? 'Google' : 'Email'}.`,
      createdAt: new Date().toISOString()
    };
    setAuditLogs(prev => [newAudit, ...prev]);
    navigateTo('dashboard');
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
    localStorage.removeItem('idp_jwt');

    setUser(null);
    setCurrentPage('login');
    localStorage.removeItem('idp_user');
    localStorage.removeItem('idp_active_project');
    localStorage.removeItem('idp_active_deploy');
    localStorage.removeItem('idp_active_incident');
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
  const createProject = async (projectData: Omit<Project, 'id' | 'createdAt' | 'ownerId' | 'status' | 'webhookUrl' | 'webhookSecret'>) => {
    if (!user) return;
    const projectId = 'p_' + Math.random().toString(36).substr(2, 9);
    const newProject: Project = {
      ...projectData,
      id: projectId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      ownerId: user.id,
      webhookUrl: `https://api.devcorp-idp.com/webhooks/${projectData.provider}`,
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
        simulateInitialBuildPipeline(merged);
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
      } catch {
        // fall through to mock
      }
    }

    setProjects(prev => [...prev, newProject]);

    // Create Audit Log
    const newAudit: AuditLog = {
      id: 'a_' + Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      action: 'PROJECT_CREATE',
      projectId: projectId,
      projectName: newProject.name,
      details: `Created project connected to ${newProject.repoOwner}/${newProject.repoName} on branch ${newProject.branch}.`,
      createdAt: new Date().toISOString()
    };
    setAuditLogs(prev => [newAudit, ...prev]);

    // Push initial notification
    const newNotify: Notification = {
      id: 'n_' + Math.random().toString(36).substr(2, 9),
      title: 'Project Registered',
      message: `Project ${newProject.name} successfully registered. Initiating connection checks...`,
      type: 'info',
      projectId: projectId,
      read: false,
      createdAt: new Date().toISOString()
    };
    setNotifications(prev => [newNotify, ...prev]);

    // Simulate build pipeline immediately (Self-service deployment simulation)
    simulateInitialBuildPipeline(newProject);
    
    // Navigate to projects
    navigateTo('projects');
  };

  const simulateInitialBuildPipeline = (project: Project) => {
    const deploymentId = 'd_' + Math.random().toString(36).substr(2, 9);
    const date = new Date();

    // 1. Queued state
    const newDeploy: Deployment = {
      id: deploymentId,
      projectId: project.id,
      projectName: project.name,
      version: 'v1.0.0',
      status: 'queued',
      commitHash: Math.random().toString(16).substr(2, 7),
      commitMessage: 'Initial build commit',
      branch: project.branch,
      author: user?.name || 'Alex Mercer',
      authorAvatar: user?.avatarUrl,
      provider: project.provider,
      durationMs: 0,
      createdAt: date.toISOString(),
      stages: [
        { name: 'Clone Codebase', status: 'running', durationMs: 0 },
        { name: 'Install Modules', status: 'pending', durationMs: 0 },
        { name: 'Build Execution', status: 'pending', durationMs: 0 },
        { name: 'Edge CDN Sync', status: 'pending', durationMs: 0 },
      ],
      logs: ['Initial integration sequence triggered...', 'Establishing secure worker context...']
    };

    setDeployments(prev => [newDeploy, ...prev]);

    // Step-by-step pipeline transitions
    setTimeout(() => {
      // 2. Building State
      setDeployments(prev => prev.map(d => {
        if (d.id === deploymentId) {
          return {
            ...d,
            status: 'building',
            stages: d.stages?.map((s, idx) => 
              idx === 0 ? { ...s, status: 'success', durationMs: 3000 } :
              idx === 1 ? { ...s, status: 'running' } : s
            ),
            logs: [...(d.logs || []), 'Codebase cloned successfully in 3s.', 'Running package installation...']
          };
        }
        return d;
      }));
      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: 'building' } : p));
    }, 3000);

    setTimeout(() => {
      // 3. Ready State (Success)
      const buildSuccess = Math.random() > 0.15; // 85% success rate for initial build
      setDeployments(prev => prev.map(d => {
        if (d.id === deploymentId) {
          if (buildSuccess) {
            return {
              ...d,
              status: 'ready',
              durationMs: 45000,
              url: `https://${project.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-idp.${project.provider === 'vercel' ? 'vercel.app' : 'netlify.app'}`,
              stages: d.stages?.map(s => ({ ...s, status: 'success', durationMs: 10000 })),
              logs: [...(d.logs || []), 'Dependencies configured successfully.', 'Running framework builds...', 'Optimized compilation succeeded.', 'Edge routing tables updated.', 'Active deployment routed successfully!']
            };
          } else {
            return {
              ...d,
              status: 'failed',
              durationMs: 24000,
              errorMessage: 'Build Failed: Missing dependency bundle package core-utils.',
              stages: [
                { name: 'Clone Codebase', status: 'success', durationMs: 3000 },
                { name: 'Install Modules', status: 'failed', durationMs: 21000 },
                { name: 'Build Execution', status: 'pending', durationMs: 0 },
                { name: 'Edge CDN Sync', status: 'pending', durationMs: 0 },
              ],
              logs: [...(d.logs || []), 'npm install: ERESOLVE unable to resolve dependency tree', 'Error: Command failed with exit code 1 (npm install)', 'Deployment run aborted. Pipeline halted.']
            };
          }
        }
        return d;
      }));

      setProjects(prev => prev.map(p => p.id === project.id ? { ...p, status: buildSuccess ? 'ready' : 'failed' } : p));

      // Trigger alerts if failed
      if (!buildSuccess) {
        const incidentId = 'inc_' + Math.random().toString(36).substr(2, 9);
        const newIncident: Incident = {
          id: incidentId,
          projectId: project.id,
          projectName: project.name,
          deploymentId: deploymentId,
          severity: 'high',
          provider: project.provider,
          title: 'Initial Build Pipeline Failure',
          description: 'The package installation sequence failed due to missing module resolutions. The project cannot be compiled.',
          status: 'open',
          createdAt: new Date().toISOString(),
          comments: [],
          suggestedAction: 'Fix package conflicts or update packages configuration.',
          timeline: [
            { event: 'Project build failed', timestamp: new Date().toISOString(), type: 'alert' },
            { event: 'Critical incident automatically opened', timestamp: new Date().toISOString(), type: 'alert' }
          ]
        };
        setIncidents(prev => [newIncident, ...prev]);

        setNotifications(prev => [{
          id: 'n_' + Math.random().toString(36).substr(2, 9),
          title: 'Deployment Failed',
          message: `Initial deploy for ${project.name} failed. Incident created.`,
          type: 'error',
          projectId: project.id,
          incidentId: incidentId,
          deploymentId: deploymentId,
          read: false,
          createdAt: new Date().toISOString()
        }, ...prev]);
      } else {
        setNotifications(prev => [{
          id: 'n_' + Math.random().toString(36).substr(2, 9),
          title: 'Deployment Ready',
          message: `Deployment v1.0.0 for ${project.name} is now live.`,
          type: 'success',
          projectId: project.id,
          deploymentId: deploymentId,
          read: false,
          createdAt: new Date().toISOString()
        }, ...prev]);
      }
    }, 6000);
  };

  const startRollback = async (projectId: string, targetDeploymentId: string) => {
    if (!user) return;
    const project = projects.find(p => p.id === projectId);
    const targetDeploy = deployments.find(d => d.id === targetDeploymentId) ||
      deployments.find(d => d.projectId === projectId && (d.status === 'ready' || d.status === 'rolled_back'));
    const failedDeploy = deployments.find(d => d.projectId === projectId && d.status === 'failed');

    // If API is available, call it and let backend handle everything
    if (isApiAvailable()) {
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
        console.error('[rollback] API call failed, falling back to simulation:', err);
      }
    }

    // Demo / fallback mode
    if (!project || !targetDeploy) return;

    const rollbackId = 'rb_' + Math.random().toString(36).substr(2, 9);
    const newRollback: RollbackOperation = {
      id: rollbackId,
      projectId: projectId,
      projectName: project.name,
      failedDeploymentId: failedDeploy?.id || 'd_unknown',
      targetDeploymentId: targetDeploymentId,
      targetVersion: targetDeploy.version,
      status: 'queued',
      initiatedBy: user.id,
      initiatedByName: user.name,
      createdAt: new Date().toISOString(),
      auditLogs: [
        `Rollback operation initialized by administrator ${user.name}.`,
        `Targeting stable deployment ${targetDeploy.version} (Commit ${targetDeploy.commitHash}).`,
        'Queuing deployment redirection on the integration broker...'
      ]
    };

    setRollbackOperations(prev => [newRollback, ...prev]);
    
    // Set project status to building during rollback
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: 'building' } : p));

    // Simulate rollback processing API call
    setTimeout(() => {
      setRollbackOperations(prev => prev.map(rb => {
        if (rb.id === rollbackId) {
          return {
            ...rb,
            status: 'in_progress',
            auditLogs: [
              ...rb.auditLogs,
              'Dispatched redirection request to provider API endpoint...',
              `Connecting to ${project.provider} webhook routing tables...`,
              'Restoring production route endpoints...'
            ]
          };
        }
        return rb;
      }));
    }, 2000);

    setTimeout(() => {
      const rollbackSuccess = true; // Rollbacks should always succeed in demo for stability
      
      setRollbackOperations(prev => prev.map(rb => {
        if (rb.id === rollbackId) {
          return {
            ...rb,
            status: rollbackSuccess ? 'success' : 'failed',
            completedAt: new Date().toISOString(),
            auditLogs: rollbackSuccess 
              ? [...rb.auditLogs, 'Traffic successfully redirected.', 'Health probes checks verify normal state (200 OK).', 'Rollback completed successfully.']
              : [...rb.auditLogs, 'Connection to provider API timed out.', 'Rollback execution aborted.']
          };
        }
        return rb;
      }));

      if (rollbackSuccess) {
        // Change project state to rolled_back
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, status: 'rolled_back' } : p));
        
        // Mark target deployment as active (rolled_back status to display it as current active)
        const newDeployId = 'd_' + Math.random().toString(36).substr(2, 9);
        const newDeploy: Deployment = {
          ...targetDeploy,
          id: newDeployId,
          status: 'rolled_back',
          createdAt: new Date().toISOString(),
          commitMessage: `[Rollback] Restore stable ${targetDeploy.version}: ${targetDeploy.commitMessage}`,
          logs: [
            'Initiating roll route restore...',
            `Pulling archive bundle for release version ${targetDeploy.version}`,
            'Deploying serverless endpoints...',
            'Rollback success. Directing active client queries.'
          ]
        };
        setDeployments(prev => [newDeploy, ...prev]);

        // Auto-Resolve open incidents for this project
        setIncidents(prev => prev.map(inc => {
          if (inc.projectId === projectId && inc.status !== 'resolved') {
            return {
              ...inc,
              status: 'resolved',
              resolvedAt: new Date().toISOString(),
              timeline: [
                ...inc.timeline,
                { event: `Rollback to ${targetDeploy.version} succeeded. Auto-resolving incident.`, timestamp: new Date().toISOString(), type: 'status_change' }
              ]
            };
          }
          return inc;
        }));

        // Log Audit Event
        const newAudit: AuditLog = {
          id: 'a_' + Math.random().toString(36).substr(2, 9),
          userId: user.id,
          userName: user.name,
          action: 'PROJECT_ROLLBACK',
          projectId: projectId,
          projectName: project.name,
          details: `Performed manual rollback to stable release version ${targetDeploy.version}.`,
          createdAt: new Date().toISOString()
        };
        setAuditLogs(prev => [newAudit, ...prev]);

        // Create Notifications
        setNotifications(prev => [
          {
            id: 'n_' + Math.random().toString(36).substr(2, 9),
            title: 'Rollback Completed',
            message: `Service ${project.name} successfully rolled back to ${targetDeploy.version}.`,
            type: 'success',
            projectId: projectId,
            read: false,
            createdAt: new Date().toISOString()
          },
          ...prev
        ]);
      }
    }, 5000);
  };

  const addComment = (incidentId: string, content: string) => {
    if (!user) return;
    const newComment = {
      id: 'c_' + Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      userAvatar: user.avatarUrl,
      content: content,
      createdAt: new Date().toISOString()
    };

    setIncidents(prev => prev.map(inc => {
      if (inc.id === incidentId) {
        return {
          ...inc,
          comments: [...inc.comments, newComment],
          timeline: [
            ...inc.timeline,
            { event: `Developer comment added by ${user.name}`, timestamp: new Date().toISOString(), type: 'comment' }
          ]
        };
      }
      return inc;
    }));
  };

  const resolveIncident = (incidentId: string) => {
    if (!user) return;
    
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

    const incident = incidents.find(i => i.id === incidentId);
    if (incident) {
      // Set project status back to ready
      setProjects(prev => prev.map(p => p.id === incident.projectId ? { ...p, status: 'ready' } : p));

      // Audit Log
      const newAudit: AuditLog = {
        id: 'a_' + Math.random().toString(36).substr(2, 9),
        userId: user.id,
        userName: user.name,
        action: 'INCIDENT_RESOLVE',
        projectId: incident.projectId,
        projectName: incident.projectName,
        details: `Manually marked incident "${incident.title}" as resolved.`,
        createdAt: new Date().toISOString()
      };
      setAuditLogs(prev => [newAudit, ...prev]);
    }
  };

  const markNotificationAsRead = (notificationId: string) => {
    setNotifications(prev => prev.map(n => n.id === notificationId ? { ...n, read: true } : n));
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
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

  const updateIncident = (incidentId: string, updates: Partial<Incident>) => {
    setIncidents(prev => prev.map(i => i.id === incidentId ? { ...i, ...updates } : i));

    if (user) {
      const newAudit: AuditLog = {
        id: 'a_' + Math.random().toString(36).substr(2, 9),
        userId: user.id,
        userName: user.name,
        action: 'INCIDENT_UPDATE',
        details: `Updated incident ${incidentId} with fields: ${Object.keys(updates).join(', ')}.`,
        createdAt: new Date().toISOString()
      };
      setAuditLogs(prev => [newAudit, ...prev]);
    }
  };

  // Team Management Actions
  const addTeamMember = (member: Omit<TeamMember, 'id' | 'addedAt' | 'addedBy'>) => {
    if (!user) return;
    const newMember: TeamMember = {
      ...member,
      id: 'tm_' + Math.random().toString(36).substr(2, 9),
      addedAt: new Date().toISOString(),
      addedBy: user.id,
    };
    setTeamMembers(prev => [...prev, newMember]);

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

  const removeTeamMember = (memberId: string) => {
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

  const updateTeamMemberRole = (memberId: string, role: ProjectRole) => {
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
        if (res && (res as any).id) {
          const rec = res as any;
          setPluginInstallations(prev => prev.map(p => p.id === tempId ? { ...p, id: rec.id } : p));
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
        if (config.apiKey) payload.status = 'connected';

        if (Object.keys(payload).length > 0) {
          const updated = await api.plugins.update(installationId, payload);
          if (updated && (updated as any).id) {
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
      projects,
      deployments,
      incidents,
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
      navigateTo,
      loginUser,
      logoutUser,
      updateUserConnections,
      createProject,
      startRollback,
      addComment,
      resolveIncident,
      updateIncident,
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
      triggerWebhookSimulation
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
