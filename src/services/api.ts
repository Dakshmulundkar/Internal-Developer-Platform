/**
 * Frontend API service layer
 *
 * All calls are gated by isApiAvailable().
 * When VITE_API_URL is not set, the app runs in demo/mock mode.
 * JWT is stored exclusively in localStorage under key 'idp_jwt'.
 */

export const API_BASE = import.meta.env.VITE_API_URL || '';

export const isApiAvailable = (): boolean => Boolean(import.meta.env.VITE_API_URL);

// ─────────────────────────────────────────────────────────────────────────────
// Core fetch helper
// ─────────────────────────────────────────────────────────────────────────────

async function apiFetch<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('idp_jwt');

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

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
    apiFetch<{ access_token: string; token_type: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
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
};

const incidents = {
  list: () =>
    apiFetch<unknown[]>('/incidents'),

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
};
