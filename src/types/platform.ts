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
