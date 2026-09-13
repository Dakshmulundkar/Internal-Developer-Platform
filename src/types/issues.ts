/**
 * Jira-style Issue types — separate from the Incident domain.
 * Issues live on a kanban board and track work items, bugs, and tasks.
 */

export type IssueStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done';
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';
export type IssueType = 'bug' | 'task' | 'story' | 'epic';

export interface Issue {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  type: IssueType;
  assigneeId?: string;
  assigneeName?: string;
  assigneeAvatar?: string;
  reporterId: string;
  labels: string[];
  storyPoints?: number;
  /** ISO 8601 */
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  /** Foreign-key link to an incident that spawned this issue */
  linkedIncidentId?: string;
  /** Foreign-key link to a failing deployment */
  linkedDeploymentId?: string;
}

export interface UpdateIssueStatusPayload {
  id: string;
  status: IssueStatus;
}

export interface CreateIssuePayload {
  projectId: string;
  title: string;
  description?: string;
  status?: IssueStatus;
  priority?: IssuePriority;
  type?: IssueType;
  assigneeId?: string;
  labels?: string[];
  storyPoints?: number;
  dueDate?: string;
  linkedIncidentId?: string;
  linkedDeploymentId?: string;
}
