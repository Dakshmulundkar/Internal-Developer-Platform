# Implementation Plan: Phase 2 — Real Backend Integration

## Overview

Tasks 1–2 are complete (backend scaffold + auth router). `src/services/api.ts` is fully implemented. All backend routers/webhooks are stubs. The 5 tasks below complete everything remaining: backend business logic, frontend wiring, infrastructure, and config files.

## Tasks

- [x] 1. Set up FastAPI backend project structure
  - backend/pyproject.toml, main.py, config.py, database.py, dependencies.py, .env.example, package __init__ files — DONE

- [x] 2. Backend authentication router
  - backend/models/user.py, backend/routers/auth.py — register, login, logout, me — DONE

- [x] 3. All backend routers, services, webhooks, and models (complete stubs)
  - **Models** — create these Pydantic model files:
    - `backend/models/project.py`: `ProjectCreate(name,description,repo_owner,repo_name,branch,provider,vercel_project_id,netlify_site_id)`, `ProjectUpdate` (all optional), `ProjectResponse` (all fields + id, owner_id, created_at)
    - `backend/models/incident.py`: `IncidentCreate`, `IncidentUpdate`, `IncidentResponse(id,project_id,deployment_id,severity,provider,title,description,status,assigned_to,ignored_reason,feedback_is_real,feedback_comment,suggested_action,resolved_at,created_at)`, `CommentCreate(content)`, `FeedbackUpdate(is_real,comment)`
    - `backend/models/deployment.py`: `DeploymentResponse(id,project_id,version,status,commit_hash,commit_message,branch,author,provider,url,error_message,created_at)`
    - `backend/models/rollback.py`: `RollbackRequest(project_id,target_deployment_id)`, `RollbackResponse(rollback_id,status)`
    - `backend/models/notification.py`: `NotificationResponse(id,user_id,title,message,type,read,created_at)`
    - `backend/models/ai.py`: `AnalyzeRequest(incident_id,title,description,error_message,logs,provider)`, `AnalysisResponse(explanation,confidence,causes,steps)`
  - **Services** — create these service files:
    - `backend/services/incident_service.py`:
      - `async def create_from_deployment(deployment_id: str)`: query supabase deployments by id, build incident dict (title=f"Deployment failed: {deployment.error_message or deployment.version}", severity="critical", provider from deployment, project_id from deployment), insert to `incidents`, insert `incident_timeline` event type="alert" event="Incident auto-created from failed deployment"
      - `async def create_from_alert(alert: dict)`: insert incident from monitoring alert, insert timeline event
    - `backend/services/rollback_service.py`:
      - `async def execute_rollback(project_id, target_deployment_id, user_id)`: fetch project from supabase, fetch target deployment; if provider="vercel" POST `https://api.vercel.com/v9/projects/{project.vercel_project_id}/aliases` with body `{"deployment": target_deployment_id}` + Bearer `settings.VERCEL_API_TOKEN`; if provider="netlify" POST `https://api.netlify.com/api/v1/sites/{project.netlify_site_id}/deploys/{target_deployment_id}/restore` + Bearer `settings.NETLIFY_API_TOKEN`; insert `rollback_operations` row status="in_progress", audit_logs=[]; return inserted row id
      - `async def poll_rollback_status(rollback_id: str)`: check provider deployment status every 5s up to 10 attempts; update `rollback_operations.status` and append step to `audit_logs` JSONB array
    - `backend/services/audit_service.py`:
      - `async def log(user_id, user_name, action, details, project_id=None)`: insert to `audit_logs`
    - `backend/services/notification_service.py`:
      - `async def create_notification(user_id, title, message, type, project_id=None, incident_id=None, deployment_id=None)`: insert to `notifications` table; import `broadcast_to_user` from `main` and call `await broadcast_to_user(str(user_id), "notification.new", {"title": title, "message": message})`
    - `backend/services/ai_service.py`:
      - `async def analyze_incident(context: dict) -> dict`: build system prompt "You are a DevOps expert. Analyze this incident and respond in JSON with keys: explanation (string), confidence (0-100 int), causes (list of strings), steps (list of {title,description} objects). Last step title must be 'Mark incident as resolved'."; if `settings.OPENAI_API_KEY` → POST `https://api.openai.com/v1/chat/completions` model="gpt-4o-mini" response_format={"type":"json_object"} with Bearer; elif `settings.GROQ_API_KEY` → POST `https://api.groq.com/openai/v1/chat/completions` model="llama3-8b-8192"; else return hardcoded `{"explanation":"Unable to analyze — no LLM key configured.","confidence":0,"causes":[],"steps":[{"title":"Review logs manually","description":"Check deployment logs for errors."},{"title":"Mark incident as resolved","description":""}]}`; parse and return dict
      - `async def get_cached(incident_id)`: query `ai_analyses` by incident_id, return dict or None
      - `async def cache(incident_id, result)`: upsert to `ai_analyses` (incident_id, explanation, confidence, causes, steps)
    - `backend/services/vercel_service.py`:
      - `async def fetch_deployments(vercel_project_id, api_token)`: GET `https://api.vercel.com/v6/deployments?projectId={vercel_project_id}` Bearer token via httpx; map each to internal deployment dict (version=d.url, status=d.state mapped to queued/success/failed, commit_hash=d.meta.githubCommitSha, commit_message=d.meta.githubCommitMessage, branch=d.meta.githubCommitRef, author=d.meta.githubCommitAuthorName, provider="vercel", url=d.url); return list
    - `backend/services/netlify_service.py`:
      - `async def fetch_deployments(site_id, api_token)`: GET `https://api.netlify.com/api/v1/sites/{site_id}/deploys` Bearer; map state ready→success, error→failed, building→queued; return list
    - `backend/services/grafana_service.py`:
      - `async def fetch_alerts(base_url, api_key)`: GET `{base_url}/api/alerts` header Authorization=Bearer {api_key}; map each to monitoring_alerts dict (source="grafana", title=a.name, severity based on a.state, status="firing" if state="alerting" else "resolved")
    - `backend/services/sentry_service.py`:
      - `async def fetch_issues(org, project, token)`: GET `https://sentry.io/api/0/projects/{org}/{project}/issues/?query=is:unresolved` header Authorization=Bearer {token}; map to monitoring_alerts (source="sentry", title=i.title, severity based on i.level)
    - `backend/services/datadog_service.py`:
      - `async def fetch_monitors(api_key, app_key)`: GET `https://api.datadoghq.com/api/v1/monitor` headers DD-API-KEY={api_key} DD-APPLICATION-KEY={app_key}; map to monitoring_alerts (source="datadog", title=m.name, severity based on m.overall_state)
    - `backend/background/plugin_sync.py`:
      - `async def sync_all_plugins()`: query supabase `plugin_installations` where status="connected"; for each: if plugin_id contains "grafana" call grafana_service.fetch_alerts; if "sentry" call sentry_service.fetch_issues; if "datadog" call fetch_monitors; upsert results to `monitoring_alerts`; for any alert with severity="critical" check if open incident exists for same source+project, if none call `incident_service.create_from_alert(alert)`
  - **Routers** — replace stubs with full implementations:
    - `backend/routers/projects.py` (all require `current_user=Depends(get_current_user)`):
      - `GET /projects` → `supabase.table("projects").select("*").eq("owner_id", user.id).execute()`
      - `POST /projects` → insert with owner_id=user.id, return row
      - `GET /projects/{id}` → fetch + 404 if owner_id mismatch
      - `PATCH /projects/{id}` → partial update, return updated
      - `DELETE /projects/{id}` → delete, return `{"success":true}`; call `audit_service.log`
    - `backend/routers/incidents.py` (all require auth):
      - `GET /incidents` → join via `project_id IN (SELECT id FROM projects WHERE owner_id=user.id)` using supabase filter
      - `GET /incidents/{id}` → fetch + subquery comments + timeline
      - `POST /incidents/{id}/resolve` → update status="resolved", resolved_at=datetime.utcnow().isoformat(), insert timeline event; call audit_service.log + notification_service.create_notification
      - `POST /incidents/{id}/ignore` → update ignored_reason, status="resolved"
      - `POST /incidents/{id}/comments` → insert incident_comments + timeline event type="comment"
      - `POST /incidents/{id}/feedback` → update feedback_is_real, feedback_comment
      - `PATCH /incidents/{id}` → update any fields from body
    - `backend/routers/deployments.py` (requires auth):
      - `GET /deployments` → filter by user's project_ids
      - `GET /deployments/sync/{project_id}` → fetch project, call vercel_service or netlify_service based on provider, upsert results to supabase deployments, return `{"synced": count}`
    - `backend/routers/rollback.py` (requires auth):
      - `POST /rollback` → call rollback_service.execute_rollback, add BackgroundTasks poll_rollback_status, return `{"rollback_id":id,"status":"in_progress"}`
      - `GET /rollback/{id}` → fetch rollback_operations row
    - `backend/routers/ai.py` (requires auth):
      - `POST /ai/analyze` → check cache via ai_service.get_cached(incident_id); if hit return cached; else call ai_service.analyze_incident, cache, return
      - `GET /ai/analyze/{incident_id}` → ai_service.get_cached or 404
    - `backend/routers/monitoring.py` (requires auth):
      - `GET /monitoring/alerts` → filter monitoring_alerts by user's project_ids
      - `POST /monitoring/sync` → add sync_all_plugins as BackgroundTask, return `{"status":"sync_started"}`
    - `backend/routers/notifications.py` (requires auth):
      - `GET /notifications` → filter by user_id order by created_at desc
      - `PATCH /notifications/{id}/read` → update read=True
      - `PATCH /notifications/read-all` → bulk update read=True where user_id=user.id
    - `backend/routers/audit.py` (requires auth):
      - `GET /audit` → query audit_logs by user_id, query params limit (default 20), offset (default 0), project_id optional
  - **Webhooks** — replace stubs:
    - `backend/webhooks/vercel_webhook.py`:
      - `POST /webhooks/vercel` — no auth, read `Request.body()` bytes; compute `hmac.new(settings.VERCEL_WEBHOOK_SECRET.encode(), body, sha1).hexdigest()`; compare to `x-vercel-signature` header; 401 on mismatch; parse JSON body; map event_type: deployment.created→queued, deployment.succeeded→success, deployment.error→failed; find project by vercel_project_id; upsert to supabase deployments ON CONFLICT(external_event_id); if failed add BackgroundTask(incident_service.create_from_deployment, deployment_id); return `{"received":true}`
    - `backend/webhooks/netlify_webhook.py`:
      - `POST /webhooks/netlify` — HMAC-SHA256 of raw body with settings.NETLIFY_WEBHOOK_SECRET compare to x-netlify-signature; parse deploy_created/succeeded/failed; upsert deployments; if failed background incident creation; return 200
  - **config.py** — add missing fields to Settings class: `VERCEL_API_TOKEN: str = ""`, `NETLIFY_API_TOKEN: str = ""`, `GRAFANA_BASE_URL: str = ""`, `GRAFANA_API_KEY: str = ""`, `SENTRY_ORG: str = ""`, `SENTRY_PROJECT: str = ""`, `SENTRY_TOKEN: str = ""`, `DATADOG_API_KEY: str = ""`, `DATADOG_APP_KEY: str = ""`

- [x] 4. Frontend wiring — PlatformContext + page components
  - **`src/context/PlatformContext.tsx`** — wire all API calls (keep all demo-mode fallbacks unchanged):
    - Import `isApiAvailable`, `api` from `src/services/api.ts`
    - `loginUser`: if `isApiAvailable()` → call `api.auth.login(email,password)`, `localStorage.setItem('idp_jwt', data.access_token)`, decode JWT payload (base64 middle part) for user object; else existing mock
    - On app mount `useEffect([], ...)`: if `isApiAvailable()` → parallel fetch `api.projects.list()` + `api.incidents.list()` + `api.notifications.list()`; set state from results; else use initialProjects/initialIncidents/seed data
    - `createProject`: if API → `api.projects.create(data)`, append returned project to state; else existing mock
    - `updateProject`: if API → `api.projects.update(id, data)`, patch state; else existing mock
    - `resolveIncident(id)`: if API → `api.incidents.resolve(id)`, patch state; else localStorage
    - `addComment(id, text)`: if API → `api.incidents.comment(id, text)`, append to state; else existing
    - `updateIncident(id, updates)`: if API → `api.incidents.update(id, updates)`, patch state; else existing
    - `markNotificationRead(id)`: if API → `api.notifications.markRead(id)`; else localStorage
    - `markAllRead()`: if API → `api.notifications.markAllRead()`; else localStorage
    - WebSocket: after login if `import.meta.env.VITE_WS_URL` → open `new WebSocket(\`${import.meta.env.VITE_WS_URL}/ws/${user.id}\`)`; `onmessage` → parse JSON, switch on `event_type`: "deployment.status_changed" patch deployments state, "incident.created" prepend to incidents, "rollback.progress" store in a `rollbackStatus` state map keyed by rollback_id, "notification.new" increment unread count; `onclose` → exponential backoff reconnect (1s,2s,4s,8s,16s,30s); on logout close + null ref; demo mode (no VITE_WS_URL) keep existing setTimeout simulations unchanged
  - **`src/pages/AIAssistant.tsx`**: import `isApiAvailable`, `api`; on analyze submit if API → set loading=true, call `api.ai.analyze({incident_id,title,description,error_message,logs,provider})`, set loading=false, map response.steps to display; show `<div className="animate-pulse ...">Analyzing...</div>` while loading; catch errors and fall back to aiExplanations seed; else existing seed behavior
  - **`src/pages/Incidents.tsx`** right sidebar "How to Remediate" section: on incident select, if API → call `api.ai.getAnalysis(incident.id)` in useEffect; if response ok map response.steps to RemediationStep format; on 404 or error fall back to existing `getRemediationSteps(incident.deploymentId)`
  - **`src/pages/RollbackRecovery.tsx`**: import `isApiAvailable`, `api`; `startRollback` function: if API → call `api.rollback.start(projectId, targetDeploymentId)`, store `rollbackId` in state; add `useEffect` that runs while rollbackId is set and status is "in_progress" → call `api.rollback.get(rollbackId)` every 3000ms via `setInterval`; on each poll update progress display steps from `audit_logs` array; on status reaching "success" or "failed" clear interval; on unmount clear interval; else existing local simulation unchanged
  - **`src/pages/Monitoring.tsx`**: import `isApiAvailable`, `api`; add `useEffect([], ...)` → if API fetch `api.monitoring.getAlerts()` and set local `alerts` state; else use `monitoringAlerts` from context; display from local state when available
  - **`src/pages/Integrations.tsx`**: import `isApiAvailable`, `api`; after any plugin config save action: if API call `api.monitoring.sync()` (fire and forget, no await needed)
  - **`src/pages/Dashboard.tsx`**: import `isApiAvailable`, `api`; add `useEffect([], ...)` → if API fetch `api.audit.list(10)` and set local `recentAuditLogs` state; else use `auditLogs` from context; render from local state when available

- [x] 5. Infrastructure files + Supabase schema + secrets/env docs
  - **Supabase schema** — create `backend/supabase_schema.sql`:
    - All CREATE TABLE IF NOT EXISTS statements matching design.md: projects, deployments, incidents, incident_comments, incident_timeline, rollback_operations, notifications, plugin_installations, monitoring_alerts, audit_logs
    - `ai_analyses` table: `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`, `incident_id UUID UNIQUE REFERENCES incidents(id) ON DELETE CASCADE`, `explanation TEXT`, `confidence INTEGER`, `causes JSONB DEFAULT '[]'`, `steps JSONB DEFAULT '[]'`, `created_at TIMESTAMPTZ DEFAULT NOW()`
    - For EVERY table: `ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;`
    - RLS policies: `CREATE POLICY "owner" ON projects FOR ALL USING (owner_id = auth.uid());`; for tables joined through projects: `CREATE POLICY "owner" ON deployments FOR ALL USING (project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()));`; same for incidents, rollback_operations, monitoring_alerts; for incident_comments/timeline: `incident_id IN (SELECT id FROM incidents WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))`; for notifications: `user_id = auth.uid()`; for audit_logs: `user_id = auth.uid()`; for ai_analyses: via incidents join
    - `CREATE PUBLICATION supabase_realtime FOR TABLE incidents, notifications, deployments;`
    - Comments on each section explaining purpose
  - **Docker** — create `backend/Dockerfile`:
    - Stage 1 `builder`: `FROM python:3.11-slim AS builder`, `WORKDIR /app`, `COPY pyproject.toml .`, `RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir .`
    - Stage 2 `runtime`: `FROM python:3.11-slim`, `WORKDIR /app`, `COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages`, `COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn`, `COPY . .`, `EXPOSE 8000`, `HEALTHCHECK --interval=30s --timeout=5s --start-period=5s CMD curl -f http://localhost:8000/health || exit 1`, `CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]`
  - Create `backend/.dockerignore`: `__pycache__/`, `*.pyc`, `.env`, `.env.*`, `!.env.example`, `.git/`, `tests/`, `*.egg-info/`, `.pytest_cache/`
  - **Kubernetes base** — create `k8s/base/`:
    - `deployment.yaml`: apps/v1 Deployment `idp-backend` replicas=2, container `ghcr.io/dakshmulundkar/idp-backend:latest` port 8000, envFrom configMapRef `idp-config` + secretRef `idp-secrets`, readinessProbe+livenessProbe httpGet `/health`, resources requests cpu=100m/mem=256Mi limits cpu=500m/mem=512Mi
    - `service.yaml`: ClusterIP Service port 8000 selector `app: idp-backend`
    - `configmap.yaml`: ConfigMap `idp-config` CORS_ORIGINS=http://localhost:5173, LOG_LEVEL=INFO, ENVIRONMENT=production
    - `ingress.yaml`: Nginx Ingress host `api.idp.devcorp.com` annotations `kubernetes.io/ingress.class: nginx` + `cert-manager.io/cluster-issuer: letsencrypt-prod` TLS secretName `idp-tls` backend idp-backend:8000
    - `hpa.yaml`: autoscaling/v2 HPA min=2 max=6 CPU averageUtilization=70
    - `kustomization.yaml`: lists all 5 resources
  - **Kubernetes overlays** — create:
    - `k8s/overlays/dev/kustomization.yaml` namespace=idp-dev resources=[../../base] patches=[patch-replicas.yaml,patch-configmap.yaml]
    - `k8s/overlays/dev/patch-replicas.yaml`: spec.replicas=1
    - `k8s/overlays/dev/patch-configmap.yaml`: data.ENVIRONMENT=dev
    - `k8s/overlays/staging/kustomization.yaml` namespace=idp-staging resources=[../../base] patches=[patch-configmap.yaml]
    - `k8s/overlays/staging/patch-configmap.yaml`: data.ENVIRONMENT=staging
    - `k8s/overlays/production/kustomization.yaml` namespace=idp-production resources=[../../base] images=[{name:ghcr.io/dakshmulundkar/idp-backend, newTag:latest}] patches=[patch-replicas.yaml,patch-configmap.yaml]
    - `k8s/overlays/production/patch-replicas.yaml`: spec.replicas=3
    - `k8s/overlays/production/patch-configmap.yaml`: data.ENVIRONMENT=production
  - **ArgoCD** — create `argocd/`:
    - `application-dev.yaml`: argoproj.io/v1alpha1 Application name=idp-backend-dev namespace=argocd, source repoURL=`https://github.com/Dakshmulundkar/Internal-Developer-Platform` targetRevision=main path=k8s/overlays/dev, destination namespace=idp-dev, syncPolicy syncOptions=[CreateNamespace=true] NO automated block
    - `application-staging.yaml`: same, path=k8s/overlays/staging, namespace=idp-staging, syncPolicy automated prune=true selfHeal=true
    - `application-production.yaml`: path=k8s/overlays/production, namespace=idp-production, syncPolicy automated prune=true selfHeal=true
  - **GitHub Actions** — create `.github/workflows/build-push.yml`:
    - trigger: `on: push: branches: [main]` paths: `['backend/**']`
    - job `build-and-push` ubuntu-latest permissions contents:write packages:write
    - steps: checkout fetch-depth=0, docker/setup-buildx-action@v3, login ghcr.io docker/login-action@v3 registry=ghcr.io username=${{github.actor}} password=${{secrets.GITHUB_TOKEN}}, run `echo "SHORT_SHA=$(echo $GITHUB_SHA | cut -c1-7)" >> $GITHUB_ENV`, docker/build-push-action@v5 context=./backend push=true tags=`ghcr.io/dakshmulundkar/idp-backend:${{env.SHORT_SHA}},ghcr.io/dakshmulundkar/idp-backend:latest`, run `sed -i "s/newTag: .*/newTag: ${{env.SHORT_SHA}}/" k8s/overlays/production/kustomization.yaml`, run `git config --global user.email "ci@github.com" && git config --global user.name "CI Bot" && git add k8s/overlays/production/kustomization.yaml && git commit -m "ci: update backend image to ${{env.SHORT_SHA}}" && git push`
  - **Env files** — update/create:
    - Update `backend/.env.example` — add after existing content: `VERCEL_API_TOKEN=` (Vercel API token for deployment sync), `NETLIFY_API_TOKEN=` (Netlify personal access token), `GRAFANA_BASE_URL=` (e.g. http://grafana.example.com), `GRAFANA_API_KEY=` (Grafana service account token), `SENTRY_ORG=` (Sentry org slug), `SENTRY_PROJECT=` (Sentry project slug), `SENTRY_TOKEN=` (Sentry auth token), `DATADOG_API_KEY=` (Datadog API key), `DATADOG_APP_KEY=` (Datadog application key)
    - Create `.env.example` at project root: `# Frontend env vars — copy to .env.local for local dev\nVITE_API_URL=http://localhost:8000\nVITE_WS_URL=ws://localhost:8000`
    - Create `.env.production` at project root: `VITE_API_URL=https://api.idp.devcorp.com\nVITE_WS_URL=wss://api.idp.devcorp.com\n# Override these in your Vercel/Netlify dashboard for production`
    - Create `k8s/secrets.example.txt`: kubectl create secret command template listing all keys: SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY, OPENAI_API_KEY, GROQ_API_KEY, VERCEL_WEBHOOK_SECRET, NETLIFY_WEBHOOK_SECRET, VERCEL_API_TOKEN, NETLIFY_API_TOKEN, GRAFANA_BASE_URL, GRAFANA_API_KEY, SENTRY_ORG, SENTRY_PROJECT, SENTRY_TOKEN, DATADOG_API_KEY, DATADOG_APP_KEY
    - Update root `.gitignore` — add: `backend/.env`, `.env.local`, `k8s/**/secret.yaml`, `k8s/**/secrets.yaml`

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": [1, 2] },
    { "wave": 2, "tasks": [3] },
    { "wave": 3, "tasks": [4, 5] }
  ],
  "dependencies": {
    "3": ["1", "2"],
    "4": ["3"],
    "5": ["3"]
  }
}
```

## Notes

- Tasks 1 and 2 are already complete — do not re-implement them.
- `src/services/api.ts` is fully implemented — do not overwrite it.
- Backend routers are stubs — replace their entire file content.
- Demo mode (no `VITE_API_URL` / `VITE_WS_URL`) must work unchanged. Every API call is gated by `isApiAvailable()`.
- JWT stored in `localStorage` key `idp_jwt` only.
- Webhook endpoints use HMAC verification, not Bearer auth.
- `backend/supabase_schema.sql` is a manual runbook — paste into Supabase SQL editor.
- GitHub Actions uses auto-provided `GITHUB_TOKEN` for GHCR — no extra secrets needed.
