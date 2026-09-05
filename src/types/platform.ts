export type UserRole = 'developer' | 'operator' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  role: UserRole;
  connectedGithub?: string;
  connectedVercel?: boolean;
  connectedNetlify?: boolean;
}

export type ProviderType = 'vercel' | 'netlify';
export type EnvironmentType = 'production' | 'staging' | 'preview';
export type DeploymentStatus = 'queued' | 'building' | 'ready' | 'failed' | 'canceled' | 'rolled_back';

export interface Project {
  id: string;
  name: string;
  description: string;
  repoOwner: string;
  repoName: string;
  branch: string;
  provider: ProviderType;
  environment: EnvironmentType;
  status: DeploymentStatus;
  createdAt: string;
  ownerId: string;
  vercelProjectId?: string;
  netlifySiteId?: string;
  webhookSecret?: string;
  webhookUrl?: string;
  apiTokenHint?: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  projectName: string;
  version: string; // e.g. "v1.2.0"
  status: DeploymentStatus;
  commitHash: string;
  commitMessage: string;
  branch: string;
  author: string;
  authorAvatar?: string;
  provider: ProviderType;
  durationMs: number;
  createdAt: string;
  url?: string;
  logs?: string[];
  stages?: {
    name: string;
    status: 'pending' | 'running' | 'success' | 'failed';
    durationMs: number;
  }[];
  errorMessage?: string;
}

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'investigating' | 'resolved';

export interface IncidentComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar: string;
  content: string;
  createdAt: string;
}

export interface Incident {
  id: string;
  projectId: string;
  projectName: string;
  deploymentId?: string;
  severity: IncidentSeverity;
  provider: ProviderType;
  title: string;
  description: string;
  status: IncidentStatus;
  assignedTo?: string;
  createdAt: string;
  resolvedAt?: string;
  comments: IncidentComment[];
  suggestedAction?: string;
  timeline: {
    event: string;
    timestamp: string;
    type: 'alert' | 'comment' | 'action' | 'status_change';
  }[];
  ignoredReason?: string;
  feedbackIsReal?: boolean;
  feedbackComment?: string;
}

export interface RollbackOperation {
  id: string;
  projectId: string;
  projectName: string;
  failedDeploymentId: string;
  targetDeploymentId: string;
  targetVersion: string;
  status: 'queued' | 'in_progress' | 'success' | 'failed';
  initiatedBy: string;
  initiatedByName: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
  auditLogs: string[];
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'incident';
  projectId?: string;
  incidentId?: string;
  deploymentId?: string;
  read: boolean;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  projectId?: string;
  projectName?: string;
  details: string;
  createdAt: string;
}

export interface AIChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  createdAt: string;
  context?: {
    projectId?: string;
    deploymentId?: string;
    incidentId?: string;
  };
  suggestions?: string[];
  confidenceScore?: number;
  causes?: string[];
  recommendations?: string[];
}

// ────────────────────────────────────────────────
// Plugin / Integration System
// ────────────────────────────────────────────────

export type PluginCategory = 'deployment' | 'monitoring' | 'error_tracking' | 'collaboration' | 'source_control';
export type PluginAuthMethod = 'api_key' | 'oauth' | 'webhook' | 'basic_auth';
export type PluginStatus = 'connected' | 'disconnected' | 'syncing' | 'error' | 'not_installed';

export interface PluginDefinition {
  id: string;
  name: string;
  provider: string;
  category: PluginCategory;
  description: string;
  capabilities: string[];
  requiredPermissions: string[];
  authMethod: PluginAuthMethod;
  webhookEvents?: string[];
  docsUrl?: string;
  iconColor: string;      // Tailwind color class for icon accent
  iconLabel: string;      // Short label shown in icon badge
}

export interface PluginInstallation {
  id: string;
  pluginId: string;
  pluginName: string;
  category: PluginCategory;
  status: PluginStatus;
  apiKey?: string;         // masked – never expose full key
  apiKeyHint?: string;     // e.g. "gf_••••••••3a9b"
  baseUrl?: string;        // e.g. "https://grafana.company.com"
  projectSelector?: string;  // external project/service name
  webhookUrl?: string;
  webhookSecret?: string;
  lastSyncAt?: string;
  installedAt: string;
  installedById: string;
  enabledForProjects: string[];   // IDP project IDs
  recentEvents?: { message: string; timestamp: string; type: 'info' | 'error' | 'success' }[];
  errorMessage?: string;
}

// ────────────────────────────────────────────────
// Monitoring / Observability
// ────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type AlertStatus = 'firing' | 'resolved' | 'pending' | 'no_data';
export type AlertSource = 'grafana' | 'datadog' | 'sentry' | 'vercel' | 'netlify';

export interface MonitoringAlert {
  id: string;
  source: AlertSource;
  title: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  projectId?: string;
  projectName?: string;
  deploymentId?: string;
  incidentId?: string;
  labels?: Record<string, string>;
  value?: string;           // e.g. "p99: 3400ms"
  threshold?: string;       // e.g. "> 2000ms"
  firedAt: string;
  resolvedAt?: string;
  url?: string;             // link back to source dashboard
}

export interface SentryIssue {
  id: string;
  title: string;
  culprit: string;
  status: 'unresolved' | 'resolved' | 'ignored';
  level: 'fatal' | 'error' | 'warning' | 'info';
  projectId?: string;
  deploymentId?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  release?: string;
  environment?: string;
  stackTrace?: string;
}

// ────────────────────────────────────────────────
// Team Management
// ────────────────────────────────────────────────

export type ProjectRole = 'viewer' | 'developer' | 'admin';

export interface TeamMember {
  id: string;
  userId: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: ProjectRole;
  projectId: string;
  addedAt: string;
  addedBy: string;
}

// ────────────────────────────────────────────────
// ArgoCD / Infrastructure
// ────────────────────────────────────────────────

export interface ArgoCDAppStatus {
  appName: string;
  syncStatus: 'Synced' | 'OutOfSync' | 'Degraded' | 'Unknown';
  healthStatus: 'Healthy' | 'Progressing' | 'Degraded' | 'Suspended';
  currentImageTag: string;
  lastSyncedAt: string;
  repoUrl: string;
  targetRevision: string;
  namespace: string;
}
