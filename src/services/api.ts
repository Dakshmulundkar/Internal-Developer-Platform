/**
 * Frontend API service layer
 *
 * All calls are gated by isApiAvailable().
 * When VITE_API_URL is not set, the app runs in demo/mock mode.
 * JWT is stored exclusively in localStorage under key 'idp_jwt'.
 */

export const API_BASE = import.meta.env.VITE_API_URL || '';

// isApiAvailable: true when VITE_USE_API=true (proxy mode) OR VITE_API_URL is set (direct mode)
export const isApiAvailable = (): boolean =>
  Boolean(import.meta.env.VITE_USE_API) || Boolean(import.meta.env.VITE_API_URL);

// ─────────────────────────────────────────────────────────────────────────────
// Silent session refresh
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH_KEY = 'idp_refresh_token';

let refreshInFlight: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      localStorage.removeItem(REFRESH_KEY);
      return false;
    }
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem('idp_jwt', data.access_token);
      if (data.refresh_token) localStorage.setItem(REFRESH_KEY, data.refresh_token);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function tryRefreshToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Decode the JWT payload (best effort) to check remaining validity. */
function jwtExpiryMs(): number | null {
  const token = localStorage.getItem('idp_jwt');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload && payload.exp) return payload.exp * 1000;
    return null;
  } catch {
    return null;
  }
}

/**
 * Proactively refresh the session if the access token is near/at expiry.
 * Call at app boot so the 1-hour Supabase token never dies mid-session.
 */
export async function ensureValidSession(): Promise<void> {
  const exp = jwtExpiryMs();
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!exp || !refreshToken) return;
  if (exp - Date.now() < 30_000) {
    await tryRefreshToken();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch helper
// ─────────────────────────────────────────────────────────────────────────────

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const token = localStorage.getItem('idp_jwt');

  // For FormData bodies, don't set Content-Type — browser sets the multipart boundary.
  const isFormData = options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  // 401 → try a silent refresh once, then retry the original request.
  if (response.status === 401 && !retried) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      const newToken = localStorage.getItem('idp_jwt');
      if (newToken) headers['Authorization'] = `Bearer ${newToken}`;
      return apiFetch(path, { ...options, headers }, true);
    }
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    const err = new Error(errorText || `HTTP ${response.status}`);
    (err as Error & { status: number }).status = response.status;
    throw err;
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// API namespaces
// ─────────────────────────────────────────────────────────────────────────────

const auth = {
  login: (email: string, password: string) =>
    apiFetch<{ access_token: string; refresh_token: string; user?: { id: string; email: string; name: string; role: string } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  refresh: (refreshToken: string) =>
    apiFetch<{ access_token: string; refresh_token: string; user?: { id: string; email: string; name: string; role: string } | null }>('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken }),
    }),

  loginGithub: (token: string) =>
    apiFetch<{
      access_token: string | null;
      user: { id: string; email: string; name: string; role: string };
      github_username: string;
      avatar_url: string;
    }>('/auth/github', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  githubSetup: (token: string) =>
    apiFetch<{
      github_username: string;
      repos: Array<{
        id: number;
        name: string;
        full_name: string;
        owner: string;
        description: string;
        default_branch: string;
        private: boolean;
        url: string;
        pushed_at: string;
      }>;
      plugin_installed: boolean;
    }>('/auth/github/setup', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  register: (email: string, password: string, name: string) =>
    apiFetch<{ access_token: string; token_type: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    }),

  logout: () =>
    apiFetch<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  me: () =>
    apiFetch<Record<string, unknown>>('/auth/me'),
};

const projects = {
  list: () =>
    apiFetch<unknown[]>('/projects'),

  create: (data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    apiFetch<{ success: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  pipelineFile: (id: string) =>
    apiFetch<{ path: string; sha: string; size: number; jobs: Record<string, number>; job_count: number; step_count: number; content: string }>(`/projects/${id}/pipeline-file`),
};

const incidents = {
  list: (filters?: { project_id?: string; service_id?: string; severity?: string; status?: string; source?: string }) => {
    const params = new URLSearchParams();
    if (filters?.project_id) params.set('project_id', filters.project_id);
    if (filters?.service_id) params.set('service_id', filters.service_id);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.source) params.set('source', filters.source);
    const qs = params.toString();
    return apiFetch<unknown[]>(`/incidents${qs ? `?${qs}` : ''}`);
  },

  get: (id: string) =>
    apiFetch<Record<string, unknown>>(`/incidents/${id}`),

  resolve: (id: string, reason?: string) =>
    apiFetch<Record<string, unknown>>(`/incidents/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  ignore: (id: string, reason?: string) =>
    apiFetch<Record<string, unknown>>(`/incidents/${id}/ignore`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  comment: (id: string, content: string) =>
    apiFetch<Record<string, unknown>>(`/incidents/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  feedback: (id: string, isReal: boolean, comment?: string) =>
    apiFetch<Record<string, unknown>>(`/incidents/${id}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ is_real: isReal, comment }),
    }),

  update: (id: string, data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(`/incidents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
};

const deployments = {
  list: () =>
    apiFetch<unknown[]>('/deployments'),

  sync: (projectId: string) =>
    apiFetch<{ synced: number }>(`/deployments/sync/${projectId}`),

  dispatch: (projectId: string) =>
    apiFetch<{ id: string; pipeline: { path: string; job_count: number; step_count: number } }>(`/deployments/dispatch/${projectId}`, {
      method: 'POST',
    }),
};

const rollback = {
  start: (projectId: string, targetDeploymentId: string) =>
    apiFetch<{ rollback_id: string; status: string }>('/rollback', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, target_deployment_id: targetDeploymentId }),
    }),

  get: (rollbackId: string) =>
    apiFetch<Record<string, unknown>>(`/rollback/${rollbackId}`),
};

const ai = {
  analyze: (context: Record<string, unknown>) =>
    apiFetch<{
      explanation: string;
      confidence: number;
      causes: string[];
      steps: Array<{ title: string; description: string }>;
    }>('/ai/analyze', {
      method: 'POST',
      body: JSON.stringify(context),
    }),

  getAnalysis: (incidentId: string) =>
    apiFetch<{
      explanation: string;
      confidence: number;
      causes: string[];
      steps: Array<{ title: string; description: string }>;
    }>(`/ai/analyze/${incidentId}`),
};

const monitoring = {
  getAlerts: () =>
    apiFetch<unknown[]>('/monitoring/alerts'),

  sync: () =>
    apiFetch<{ status: string }>('/monitoring/sync', { method: 'POST' }),

  probe: (projectId: string, customUrl?: string) =>
    apiFetch<Record<string, unknown>>(`/monitoring/probe/${projectId}${customUrl ? `?custom_url=${encodeURIComponent(customUrl)}` : ''}`, {
      method: 'POST',
    }),

  triggerTest: (projectId: string, testType: string, customUrl?: string) =>
    apiFetch<Record<string, unknown>>('/monitoring/trigger-test', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, test_type: testType, custom_url: customUrl }),
    }),
};

const notifications = {
  list: () =>
    apiFetch<unknown[]>('/notifications'),

  markRead: (id: string) =>
    apiFetch<Record<string, unknown>>(`/notifications/${id}/read`, { method: 'PATCH' }),

  markAllRead: () =>
    apiFetch<{ updated: number }>('/notifications/read-all', { method: 'PATCH' }),
};

const audit = {
  list: (limit?: number, projectId?: string) => {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set('limit', String(limit));
    if (projectId) params.set('project_id', projectId);
    const qs = params.toString();
    return apiFetch<unknown[]>(`/audit${qs ? `?${qs}` : ''}`);
  },
};

const plugins = {
  list: () =>
    apiFetch<unknown[]>('/plugins'),

  update: (installationId: string, data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(`/plugins/${installationId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  create: (data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/plugins', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  test: (data: Record<string, unknown>) =>
    apiFetch<{ success: boolean; message: string }>('/plugins/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  remove: (installationId: string) =>
    apiFetch<{ deleted: boolean }>(`/plugins/${installationId}`, { method: 'DELETE' }),

  oauthStart: (provider: 'slack' | 'teams', installationId: string) =>
    apiFetch<{ url: string }>(`/plugins/oauth/${provider}/start?installation_id=${encodeURIComponent(installationId)}`),

  notify: (installationId: string, title: string, message: string) =>
    apiFetch<{ success: boolean; message: string }>(`/plugins/${installationId}/notify`, {
      method: 'POST',
      body: JSON.stringify({ title, message }),
    }),
};

const comments = {
  list: (entityType: string, entityId: string) =>
    apiFetch<unknown[]>(`/comments/${entityType}/${entityId}`),

  add: (entityType: string, entityId: string, content: string) =>
    apiFetch<Record<string, unknown>>(`/comments/${entityType}/${entityId}`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),

  update: (entityType: string, entityId: string, commentId: string, content: string) =>
    apiFetch<Record<string, unknown>>(`/comments/${entityType}/${entityId}/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  delete: (entityType: string, entityId: string, commentId: string) =>
    apiFetch<{ deleted: boolean }>(`/comments/${entityType}/${entityId}/${commentId}`, {
      method: 'DELETE',
    }),
};

const team = {
  list: (projectId?: string) => {
    const qs = projectId ? `?project_id=${projectId}` : '';
    return apiFetch<unknown[]>(`/team${qs}`);
  },

  add: (data: { project_id: string; email: string; role: string; name?: string }) =>
    apiFetch<Record<string, unknown>>('/team', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRole: (memberId: string, role: string) =>
    apiFetch<Record<string, unknown>>(`/team/${memberId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),

  remove: (memberId: string) =>
    apiFetch<{ deleted: boolean }>(`/team/${memberId}`, { method: 'DELETE' }),

  searchUsers: (q: string) =>
    apiFetch<Array<{ id: string; email: string; name: string; avatar_url: string }>>(
      `/team/search?q=${encodeURIComponent(q)}`,
    ),

  /** Return all pending invites for the current user (matched by email + user_id). */
  getPendingInvites: () =>
    apiFetch<Array<{
      id: string;
      project_id: string;
      project_name: string;
      role: string;
      status: string;
      email: string;
      invite_token: string;
      added_at: string;
      invite_expires_at: string | null;
    }>>('/team/invites/pending'),

  /** Accept a pending invite using its token. */
  acceptInvite: (memberId: string, token: string) =>
    apiFetch<Record<string, unknown>>(`/team/${memberId}/accept?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    }),

  /** Decline a pending invite using its token. */
  declineInvite: (memberId: string, token: string) =>
    apiFetch<{ declined: boolean; id: string }>(`/team/${memberId}/decline?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    }),
};

const searchApi = {
  search: (q: string, type: string = 'all', projectId?: string) => {
    const params = new URLSearchParams({ q, type });
    if (projectId) params.set('project_id', projectId);
    return apiFetch<{ results: Array<{ type: string; id: string; [key: string]: unknown }>; total: number }>(
      `/search?${params.toString()}`,
    );
  },
};

const settingsApi = {
  getNotifications: () =>
    apiFetch<Record<string, unknown>>('/settings/notifications'),

  getSecurity: () =>
    apiFetch<{ configured: boolean; webhook_path: string; usage: string }>('/settings/security'),

  saveNotifications: (prefs: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/settings/notifications', {
      method: 'POST',
      body: JSON.stringify(prefs),
    }),

  getPreferences: () =>
    apiFetch<Record<string, unknown>>('/settings/preferences'),

  savePreferences: (prefs: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/settings/preferences', {
      method: 'POST',
      body: JSON.stringify(prefs),
    }),
};

const upload = {
  uploadFile: (file: File, commentId?: string, commentType: string = 'incident') => {
    const formData = new FormData();
    formData.append('file', file);
    if (commentId) formData.append('comment_id', commentId);
    formData.append('comment_type', commentType);

    const token = localStorage.getItem('idp_jwt');

    return apiFetch<{ id: string; filename: string; file_url: string; file_size: number; mime_type: string }>('/upload', {
      method: 'POST',
      body: formData,
      headers: {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      } as Record<string, string>,
    });
  },

  get: (id: string) =>
    apiFetch<Record<string, unknown>>(`/upload/${id}`),

  delete: (id: string) =>
    apiFetch<{ deleted: boolean }>(`/upload/${id}`, { method: 'DELETE' }),
};

const activities = {
  list: (entityType: 'project' | 'deployment' | 'incident' | 'rollback', entityId: string, limit = 30, offset = 0) =>
    apiFetch<Array<Record<string, unknown>>>(`/activities/${entityType}/${entityId}?limit=${limit}&offset=${offset}`),

  count: (entityType: 'project' | 'deployment' | 'incident' | 'rollback', entityId: string) =>
    apiFetch<{ count: number }>(`/activities/${entityType}/${entityId}/count`),
};

const automation = {
  listRules: (triggerType?: string) => {
    const qs = triggerType ? `?trigger_type=${encodeURIComponent(triggerType)}` : '';
    return apiFetch<unknown[]>(`/automation/rules${qs}`);
  },
  createRule: (data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/automation/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateRule: (ruleId: string, data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(`/automation/rules/${ruleId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteRule: (ruleId: string) =>
    apiFetch<{ deleted: boolean }>(`/automation/rules/${ruleId}`, { method: 'DELETE' }),
  listExecutions: (limit = 50) =>
    apiFetch<unknown[]>(`/automation/executions?limit=${limit}`),
  listTriggers: () =>
    apiFetch<{ triggers: Array<Record<string, unknown>> }>('/automation/triggers'),
  testRule: (data: Record<string, unknown>) =>
    apiFetch<{ conditions_met: boolean }>('/automation/test', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

const scheduledTasks = {
  list: () =>
    apiFetch<unknown[]>('/scheduled-tasks'),

  create: (data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/scheduled-tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  update: (taskId: string, data: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(`/scheduled-tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  remove: (taskId: string) =>
    apiFetch<{ deleted: boolean }>(`/scheduled-tasks/${taskId}`, { method: 'DELETE' }),

  run: (taskId: string) =>
    apiFetch<{ task_id: string; status: string; detail?: string }>(`/scheduled-tasks/${taskId}/run`, {
      method: 'POST',
    }),

  status: () =>
    apiFetch<{ available: boolean; running: boolean | null; jobs: number }>('/scheduled-tasks/status'),
};

const sharing = {
  create: (data: { entity_type: string; entity_id: string; expires_in_days?: number | null; password?: string | null }) =>
    apiFetch<Record<string, unknown> & { url: string }>('/share', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  public: async (entityType: string, entityId: string, token: string, password?: string) =>
    apiFetch<{ entity_type: string; entity: Record<string, unknown> }>(`/share/${entityType}/${entityId}?token=${encodeURIComponent(token)}${password ? `&password=${encodeURIComponent(password)}` : ''}`),

  mine: () =>
    apiFetch<unknown[]>('/share/mine'),

  revoke: (linkId: string) =>
    apiFetch<{ revoked: boolean }>(`/share/${linkId}`, { method: 'DELETE' }),
};

const security = {
  list: (filters?: { project_id?: string; service_id?: string; severity?: string; status?: string; limit?: number; offset?: number }) => {
    const params = new URLSearchParams();
    if (filters?.project_id) params.set('project_id', filters.project_id);
    if (filters?.service_id) params.set('service_id', filters.service_id);
    if (filters?.severity) params.set('severity', filters.severity);
    if (filters?.status) params.set('status', filters.status);
    if (filters?.limit !== undefined) params.set('limit', String(filters.limit));
    if (filters?.offset !== undefined) params.set('offset', String(filters.offset));
    const qs = params.toString();
    return apiFetch<{ total: number; limit: number; offset: number; incidents: unknown[] }>(
      `/api/security/incidents${qs ? `?${qs}` : ''}`,
    );
  },

  get: (id: string) =>
    apiFetch<Record<string, unknown>>(`/api/security/incidents/${id}`),

  resolve: (id: string, resolutionNotes?: string) =>
    apiFetch<{ status: string; incident: Record<string, unknown> }>(`/api/security/incidents/${id}/resolve`, {
      method: 'POST',
      body: JSON.stringify({ resolution_notes: resolutionNotes }),
    }),

  ignore: (id: string, reason: string) =>
    apiFetch<{ status: string; reason: string; incident: Record<string, unknown> }>(`/api/security/incidents/${id}/ignore`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  metrics: (filters?: { project_id?: string; service_id?: string; days?: number }) => {
    const params = new URLSearchParams();
    if (filters?.project_id) params.set('project_id', filters.project_id);
    if (filters?.service_id) params.set('service_id', filters.service_id);
    if (filters?.days !== undefined) params.set('days', String(filters.days));
    const qs = params.toString();
    return apiFetch<Record<string, unknown>>(`/api/security/metrics${qs ? `?${qs}` : ''}`);
  },
};

export const api = {
  auth,
  projects,
  incidents,
  deployments,
  rollback,
  ai,
  monitoring,
  notifications,
  audit,
  plugins,
  comments,
  team,
  search: searchApi,
  settings: settingsApi,
  upload,
  activities,
  automation,
  scheduledTasks,
  sharing,
  security,
};
