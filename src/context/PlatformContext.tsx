import React, { createContext, useContext, useState, useEffect } from 'react';
import type { 
  Project, Deployment, Incident, RollbackOperation, Notification, AuditLog, User,
  DeploymentStatus, IncidentStatus, IncidentSeverity, ProviderType, EnvironmentType,
  PluginInstallation, MonitoringAlert, SentryIssue
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
  pluginDefinitions
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
  startRollback: (projectId: string, targetDeploymentId: string) => void;
  addComment: (incidentId: string, content: string) => void;
  resolveIncident: (incidentId: string) => void;
  markNotificationAsRead: (notificationId: string) => void;
  markAllNotificationsRead: () => void;
  
  // Plugin Actions
  installPlugin: (pluginId: string) => void;
  uninstallPlugin: (installationId: string) => void;
  updatePluginConfig: (installationId: string, config: Partial<PluginInstallation>) => void;
  
  // Incident Update
  updateIncident: (incidentId: string, updates: Partial<Incident>) => void;

  // Webhook Simulator
  triggerWebhookSimulation: (projectId: string, forceStatus?: DeploymentStatus) => void;
}

const PlatformContext = createContext<PlatformContextProps | undefined>(undefined);

export const PlatformProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Load initial states from localStorage if available, else use seed data
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('idp_user');
    return saved ? JSON.parse(saved) : initialUser;
  });

  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem('idp_projects');
    return saved ? JSON.parse(saved) : initialProjects;
  });

  const [deployments, setDeployments] = useState<Deployment[]>(() => {
    const saved = localStorage.getItem('idp_deployments');
    return saved ? JSON.parse(saved) : initialDeployments;
  });

  const [incidents, setIncidents] = useState<Incident[]>(() => {
    const saved = localStorage.getItem('idp_incidents');
    return saved ? JSON.parse(saved) : initialIncidents;
  });

  const [rollbackOperations, setRollbackOperations] = useState<RollbackOperation[]>(() => {
    const saved = localStorage.getItem('idp_rollbacks');
    return saved ? JSON.parse(saved) : initialRollbackOperations;
  });

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem('idp_notifications');
    return saved ? JSON.parse(saved) : initialNotifications;
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    const saved = localStorage.getItem('idp_audit');
    return saved ? JSON.parse(saved) : initialAuditLogs;
  });

  const [pluginInstallations, setPluginInstallations] = useState<PluginInstallation[]>(() => {
    const saved = localStorage.getItem('idp_plugins');
    return saved ? JSON.parse(saved) : initialPluginInstallations;
  });

  const [monitoringAlerts, setMonitoringAlerts] = useState<MonitoringAlert[]>(() => {
    const saved = localStorage.getItem('idp_alerts');
    return saved ? JSON.parse(saved) : initialMonitoringAlerts;
  });

  const [sentryIssues] = useState<SentryIssue[]>(initialSentryIssues);

  // Navigation Context
  const [currentPage, setCurrentPage] = useState<PageType>(() => {
    const saved = localStorage.getItem('idp_page');
    return (saved as PageType) || 'login';
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
    localStorage.setItem('idp_page', currentPage);
  }, [currentPage]);

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

  // Auth Operations
  const loginUser = (email: string, provider?: string) => {
    const mockUser: User = {
      id: 'u_' + Math.random().toString(36).substr(2, 9),
      name: 'Daksh Mulundkar',
      email: email,
      avatarUrl: provider === 'GitHub' 
        ? 'https://images.unsplash.com/photo-1618401471353-b98aedd07871?auto=format&fit=crop&w=80&h=80&q=80'
        : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=80&h=80&q=80',
      role: 'admin',
      connectedGithub: 'Dakshmulundkar',
      connectedVercel: true,
      connectedNetlify: false,
    };
    setUser(mockUser);
    
    // Create login audit event
    const newAudit: AuditLog = {
      id: 'a_' + Math.random().toString(36).substr(2, 9),
      userId: mockUser.id,
      userName: mockUser.name,
      action: 'USER_LOGIN',
      details: `Logged in securely via ${provider || 'Email'}.`,
      createdAt: new Date().toISOString()
    };
    setAuditLogs(prev => [newAudit, ...prev]);
    navigateTo('dashboard');
  };

  const logoutUser = () => {
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
  const createProject = (projectData: Omit<Project, 'id' | 'createdAt' | 'ownerId' | 'status' | 'webhookUrl' | 'webhookSecret'>) => {
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

  const startRollback = (projectId: string, targetDeploymentId: string) => {
    if (!user) return;
    const project = projects.find(p => p.id === projectId);
    const targetDeploy = deployments.find(d => d.id === targetDeploymentId);
    const failedDeploy = deployments.find(d => d.projectId === projectId && (d.status === 'failed' || d.status === 'ready'));

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

  // Plugin Actions
  const installPlugin = (pluginId: string) => {
    if (!user) return;
    const alreadyInstalled = pluginInstallations.find(p => p.pluginId === pluginId);
    if (alreadyInstalled) return;

    const def = pluginDefinitions.find(d => d.id === pluginId);
    if (!def) return;

    const newInst: PluginInstallation = {
      id: 'inst_' + Math.random().toString(36).substr(2, 9),
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

  const updatePluginConfig = (installationId: string, config: Partial<PluginInstallation>) => {
    if (!user) return;
    setPluginInstallations(prev => prev.map(p => {
      if (p.id !== installationId) return p;
      const updated = { ...p, ...config };
      // Simulate connection test on save
      if (config.apiKey || config.apiKeyHint) {
        updated.status = 'connected';
        updated.lastSyncAt = new Date().toISOString();
        updated.errorMessage = undefined;
        updated.recentEvents = [
          { message: 'Credentials verified. Connection established.', timestamp: new Date().toISOString(), type: 'success' },
          ...(p.recentEvents || []).slice(0, 4),
        ];
      }
      return updated;
    }));

    const inst = pluginInstallations.find(p => p.id === installationId);
    const newAudit: AuditLog = {
      id: 'a_' + Math.random().toString(36).substr(2, 9),
      userId: user.id,
      userName: user.name,
      action: 'PLUGIN_CONFIG',
      details: `Updated configuration for plugin: ${inst?.pluginName || installationId}.`,
      createdAt: new Date().toISOString(),
    };
    setAuditLogs(prev => [newAudit, ...prev]);

    setNotifications(prev => [{
      id: 'n_' + Math.random().toString(36).substr(2, 9),
      title: 'Plugin Configuration Saved',
      message: `${inst?.pluginName || 'Plugin'} credentials updated and connection verified.`,
      type: 'success',
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
