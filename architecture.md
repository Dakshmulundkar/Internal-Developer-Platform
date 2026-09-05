# Architecture Document
# Aether IDP — Internal Developer Platform

**Version:** 1.5
**Status:** Phase 1 + Phase 1.5 Complete · Phase 2 Spec Ready

---

## 1. System Overview

Aether IDP is a **control-plane web application**. User applications continue to run on their selected external hosting provider (Vercel or Netlify). Aether collects events from those providers and from connected monitoring plugins, normalizes the data, surfaces it in a unified dashboard, and coordinates recovery workflows.

```
┌─────────────────────────────────────────────────┐
│  Users (Developers / Operators / Team Leads)    │
└───────────────────────┬─────────────────────────┘
                        │  Browser
┌───────────────────────▼─────────────────────────┐
│  Aether IDP Web Portal                          │
│  React 18 + TypeScript + Vite + Tailwind CSS    │
│  Deployed: Vercel / Netlify (frontend only)     │
└───────────────────────┬─────────────────────────┘
                        │  REST + WebSocket
                        │  (Phase 2 — VITE_API_URL)
┌───────────────────────▼─────────────────────────┐
│  FastAPI Backend  (Python 3.11)                 │
│  Containerized via Docker                       │
│  Deployed: Kubernetes via ArgoCD (GitOps)       │
└──────────┬─────────────────────────┬────────────┘
           │                         │
           ▼                         ▼
┌──────────────────┐    ┌────────────────────────────┐
│  Supabase        │    │  External Provider APIs     │
│  PostgreSQL DB   │    │  ├── Vercel REST API v6/v9  │
│  Auth (JWT)      │    │  ├── Netlify REST API v1    │
│  Storage         │    │  ├── GitHub API v3          │
│  Vault (secrets) │    │  ├── Grafana HTTP API       │
└──────────────────┘    │  ├── Datadog API v1/v2      │
                        │  ├── Sentry API             │
                        │  └── LLM API (OpenAI/Groq)  │
                        └────────────────────────────┘
```

---

## 2. Frontend Architecture

### 2.1 Technology Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 18.3.1 | UI framework |
| TypeScript | 5.2.2 | Type safety |
| Vite | 8.2.2 | Build tool and dev server |
| Tailwind CSS | 3.4.1 | Utility-first styling |
| Lucide React | 0.344.0 | Icon library |
| Recharts | 2.12.2 | Charts (area, line, bar) |
| React Context API | — | Global state management |

### 2.2 Project Structure

```
src/
├── components/
│   ├── Header.tsx          # Top navigation bar with notification bell
│   └── Sidebar.tsx         # Left navigation with page links
├── context/
│   └── PlatformContext.tsx  # Global state + all actions + localStorage sync
├── data/
│   └── seedData.ts          # Demo/offline seed data (5 projects, incidents, alerts)
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Projects.tsx
│   ├── CreateProjectWizard.tsx
│   ├── ProjectDetails.tsx   # 6-tab: Overview/Deployments/Monitoring/Errors/Infrastructure/Team
│   ├── Deployments.tsx
│   ├── DeploymentDetails.tsx # Build stages, logs, AI analysis, Plugin Signals
│   ├── Incidents.tsx        # GitGuardian-style list + split detail view
│   ├── RollbackRecovery.tsx
│   ├── AIAssistant.tsx
│   ├── Monitoring.tsx
│   ├── Integrations.tsx     # Plugin marketplace
│   ├── PluginConfig.tsx     # Per-plugin configuration
│   ├── Notifications.tsx
│   └── Settings.tsx         # Connections + team management
├── services/
│   └── providerApi.ts       # Phase 2 API client stub
├── types/
│   └── platform.ts          # All TypeScript interfaces and type aliases
└── main.tsx                 # App entry point
```

### 2.3 State Management

All state lives in a single React Context (`PlatformContext`). State is persisted to `localStorage` on every mutation and rehydrated on app load.

**State slices:**

| Slice | localStorage key | Description |
|-------|-----------------|-------------|
| `user` | `idp_user` | Authenticated user object |
| `projects` | `idp_projects` | Project catalog |
| `deployments` | `idp_deployments` | All deployment records |
| `incidents` | `idp_incidents` | Incident list with comments and timeline |
| `rollbackOperations` | `idp_rollbacks` | Rollback history |
| `notifications` | `idp_notifications` | Notification feed |
| `auditLogs` | `idp_audit` | Audit trail |
| `pluginInstallations` | `idp_plugins` | Installed plugin configs |
| `monitoringAlerts` | `idp_alerts` | Grafana/Datadog/Sentry/Vercel/Netlify alerts |
| `teamMembers` | `idp_team` | Per-project team membership |
| `sentryIssues` | — (read-only) | Sentry issues from seed data |

**Navigation state:**

| Key | localStorage key | Description |
|-----|-----------------|-------------|
| `currentPage` | `idp_page` | Active page identifier |
| `activeProjectId` | `idp_active_project` | Currently viewed project |
| `activeDeploymentId` | `idp_active_deploy` | Currently viewed deployment |
| `activeIncidentId` | `idp_active_incident` | Currently viewed incident |
| `activePluginId` | `idp_active_plugin` | Currently viewed plugin config |

### 2.4 Page Navigation

Single-page navigation is implemented via a `PageType` union type and a `navigateTo()` function in context. There is no React Router — all routing is handled by conditional rendering based on `currentPage`.

```ts
type PageType =
  | 'dashboard' | 'projects' | 'create-project' | 'project-details'
  | 'deployments' | 'deployment-details' | 'incidents' | 'rollback-recovery'
  | 'ai-assistant' | 'notifications' | 'settings' | 'integrations'
  | 'plugin-config' | 'monitoring' | 'login'
```

### 2.5 Demo Mode

When `VITE_API_URL` is not set, the app runs entirely on `localStorage` + `seedData.ts`. All context actions (createProject, resolveIncident, startRollback, etc.) operate on local state and simulate asynchronous behavior with `setTimeout`.

The webhook simulator (`triggerWebhookSimulation`) generates realistic deployment pipelines with staged state transitions (queued → building → ready/failed) to demonstrate the full deployment lifecycle.

---

## 3. Data Model

### 3.1 Core Types

```
User
  id, name, email, avatarUrl, role (UserRole), connectedGithub?, connectedVercel?, connectedNetlify?

Project
  id, name, description, repoOwner, repoName, branch, provider (ProviderType),
  environment (EnvironmentType), status (DeploymentStatus), createdAt, ownerId,
  vercelProjectId?, netlifySiteId?, webhookSecret?, webhookUrl?, apiTokenHint?

Deployment
  id, projectId, projectName, version, status (DeploymentStatus), commitHash,
  commitMessage, branch, author, authorAvatar?, provider, durationMs, createdAt,
  url?, logs?, stages?, errorMessage?

Incident
  id, projectId, projectName, deploymentId?, severity (IncidentSeverity),
  provider (ProviderType), title, description, status (IncidentStatus),
  assignedTo?, createdAt, resolvedAt?, comments (IncidentComment[]),
  suggestedAction?, timeline[], ignoredReason?, feedbackIsReal?, feedbackComment?

MonitoringAlert
  id, source (AlertSource), title, description, severity (AlertSeverity),
  status (AlertStatus), projectId?, deploymentId?, incidentId?,
  labels?, value?, threshold?, firedAt, resolvedAt?, url?

SentryIssue
  id, title, culprit, status, level, projectId?, deploymentId?,
  count, firstSeen, lastSeen, release?, environment?, stackTrace?

TeamMember
  id, userId, name, email, avatarUrl?, role (ProjectRole), projectId, addedAt, addedBy

ArgoCDAppStatus
  appName, syncStatus, healthStatus, currentImageTag, lastSyncedAt,
  repoUrl, targetRevision, namespace

PluginInstallation
  id, pluginId, pluginName, category, status, apiKeyHint?, baseUrl?,
  projectSelector?, webhookUrl?, webhookSecret?, lastSyncAt?, installedAt,
  installedById, enabledForProjects, recentEvents?, errorMessage?

RollbackOperation
  id, projectId, projectName, failedDeploymentId, targetDeploymentId,
  targetVersion, status, initiatedBy, initiatedByName, createdAt,
  completedAt?, error?, auditLogs[]
```

### 3.2 Key Enums

```ts
type UserRole         = 'developer' | 'operator' | 'admin'
type ProjectRole      = 'viewer' | 'developer' | 'admin'
type ProviderType     = 'vercel' | 'netlify'
type DeploymentStatus = 'queued' | 'building' | 'ready' | 'failed' | 'canceled' | 'rolled_back'
type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical'
type IncidentStatus   = 'open' | 'investigating' | 'resolved'
type AlertSeverity    = 'critical' | 'high' | 'medium' | 'low' | 'info'
type AlertStatus      = 'firing' | 'resolved' | 'pending' | 'no_data'
type AlertSource      = 'grafana' | 'datadog' | 'sentry' | 'vercel' | 'netlify'
type PluginCategory   = 'deployment' | 'monitoring' | 'error_tracking' | 'collaboration' | 'source_control'
type PluginStatus     = 'connected' | 'disconnected' | 'syncing' | 'error' | 'not_installed'
```

---

## 4. Plugin Architecture

### 4.1 Plugin Data Flow

```
External Provider API / Webhook
              │
              ▼
    Plugin Adapter (per provider)
              │
              ▼
    Event Normalizer
    (common MonitoringAlert / SentryIssue schema)
              │
              ▼
    Core IDP Services
  ┌────┬────┬──────┬──────────┐
  ▼    ▼    ▼      ▼          ▼
Dashboard Alerts Incidents AI Context Rollback
```

### 4.2 Installed Plugins (Seed Data)

| Plugin | ID | Category | Status |
|--------|-----|----------|--------|
| GitHub | inst-github | source_control | connected |
| Vercel | inst-vercel | deployment | connected |
| Netlify | inst-netlify | deployment | error |
| Grafana | inst-grafana | monitoring | connected |
| Sentry | inst-sentry | error_tracking | syncing |

### 4.3 Plugin Definition Contract

Each plugin definition (`PluginDefinition`) declares:
- `id`, `name`, `provider`, `category`
- `capabilities[]` — human-readable capability list
- `requiredPermissions[]` — OAuth/API scopes
- `authMethod` — `api_key | oauth | webhook | basic_auth`
- `webhookEvents[]` — event names the plugin can receive
- `iconColor`, `iconLabel` — badge rendering

### 4.4 Role Enforcement on Plugin Operations

| Action | Minimum Role |
|--------|-------------|
| View plugins | viewer |
| Test connection | viewer |
| Configure plugin (save API key) | admin |
| Install new plugin | admin |
| Remove plugin | admin |

---

## 5. Backend Architecture (Phase 2)

### 5.1 Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Python 3.11 |
| Framework | FastAPI |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (JWT) |
| Secret storage | Supabase Vault |
| Real-time | FastAPI WebSocket `/ws/{user_id}` |
| Background jobs | FastAPI `BackgroundTasks` |
| AI | OpenAI GPT-4o-mini / Groq Llama3 |

### 5.2 API Router Structure

```
/auth/*          — register, login, logout, me
/projects/*      — CRUD for projects
/deployments/*   — list, get, sync from provider
/incidents/*     — list, get, resolve, ignore, comment, feedback, patch
/rollback/*      — POST initiate, GET status poll
/plugins/*       — list, install, configure, remove, test
/notifications/* — list, mark read, mark all read
/audit/*         — list audit logs
/ai/*            — POST analyze, GET cached analysis
/webhooks/*      — vercel, netlify, grafana, datadog, sentry receivers
/monitoring/*    — alerts list, sync
/ws/{user_id}    — WebSocket connection
/health          — health check endpoint
```

### 5.3 Backend Folder Structure

```
backend/
├── main.py                 # App entry, CORS, router registration
├── config.py               # Settings from env vars (Pydantic BaseSettings)
├── database.py             # Supabase client singleton
├── models/                 # Pydantic schemas (request/response)
├── routers/                # FastAPI route handlers
├── services/               # Business logic per domain
│   ├── vercel_service.py
│   ├── netlify_service.py
│   ├── github_service.py
│   ├── grafana_service.py
│   ├── datadog_service.py
│   ├── sentry_service.py
│   ├── ai_service.py
│   ├── incident_service.py
│   └── webhook_service.py
├── webhooks/               # Signature validation + event ingestion per provider
├── background/             # plugin_sync.py, incident_monitor.py
├── middleware/             # JWT auth, rate limiter
└── Dockerfile              # Multi-stage build
```

### 5.4 Supabase Database Schema (Key Tables)

```sql
projects        — id, name, repo_owner, repo_name, branch, provider, owner_id
deployments     — id, project_id, version, status, commit_hash, logs (JSONB), stages (JSONB)
incidents       — id, project_id, deployment_id, severity, status, ignored_reason, feedback_is_real
incident_comments — id, incident_id, user_id, content
incident_timeline — id, incident_id, event, type
rollback_operations — id, project_id, status, audit_logs (JSONB)
notifications   — id, user_id, type, read
plugin_installations — id, plugin_id, api_key_encrypted, status
monitoring_alerts — id, source, severity, status, project_id, fired_at
audit_logs      — id, user_id, action, project_id, details
```

All tables have Row Level Security (RLS) enabled. Users can only read/write their own data.

---

## 6. GitOps / Infrastructure Architecture (Phase 2)

### 6.1 Delivery Pipeline

```
Developer pushes to main
        │
        ▼
GitHub Actions CI (build-push.yml)
  1. Build Docker image (multi-stage, Python 3.11-slim)
  2. Tag with Git SHA: ghcr.io/dakshmulundkar/idp-backend:{sha}
  3. Push to GitHub Container Registry (GHCR)
  4. Update k8s/overlays/production/kustomization.yaml (newTag: {sha})
  5. Commit + push manifest change
        │
        ▼
ArgoCD detects manifest change in k8s/overlays/production
  → Pulls new image from GHCR
  → Applies updated Deployment to Kubernetes cluster
  → selfHeal corrects any manual drift
  → prune removes orphaned resources
```

### 6.2 Kubernetes Manifest Structure

```
k8s/
├── base/
│   ├── deployment.yaml   # 2 replicas, readiness + liveness probes, resource limits
│   ├── service.yaml      # ClusterIP on port 8000
│   ├── configmap.yaml    # CORS_ORIGINS, LOG_LEVEL, ENVIRONMENT
│   ├── ingress.yaml      # Nginx ingress with TLS (cert-manager annotation)
│   └── hpa.yaml          # HPA: min 2, max 6 replicas, CPU target 70%
└── overlays/
    ├── dev/              # 1 replica, namespace: idp-dev
    ├── staging/          # 2 replicas, namespace: idp-staging
    └── production/       # 3 replicas, namespace: idp-production
```

### 6.3 ArgoCD Applications

| Application | Namespace | Sync Policy |
|------------|-----------|-------------|
| idp-backend-dev | idp-dev | Manual |
| idp-backend-staging | idp-staging | Automated (prune + selfHeal) |
| idp-backend-production | idp-production | Automated (prune + selfHeal) |

### 6.4 Kubernetes Deployment Spec (Base)

- **Image:** `ghcr.io/dakshmulundkar/idp-backend:latest` (overridden by Kustomize with Git SHA)
- **Replicas:** 2 (dev: 1, production: 3)
- **Port:** 8000
- **Readiness probe:** `GET /health` after 5s, every 10s
- **Liveness probe:** `GET /health` after 15s, every 20s
- **Resources:** requests: 100m CPU / 256Mi RAM, limits: 500m CPU / 512Mi RAM
- **Env:** from ConfigMap `idp-config` + Secret `idp-secrets`

### 6.5 Secret Management

Kubernetes secrets are created manually per namespace and never committed to Git:

```bash
kubectl create secret generic idp-secrets \
  --from-literal=SUPABASE_URL=... \
  --from-literal=SUPABASE_KEY=... \
  --from-literal=OPENAI_API_KEY=... \
  --from-literal=VERCEL_WEBHOOK_SECRET=... \
  --from-literal=NETLIFY_WEBHOOK_SECRET=... \
  -n idp-production
```

A `k8s/secrets.example.txt` documents required keys without values.

---

## 7. WebSocket Real-Time Events (Phase 2)

```
Backend: FastAPI WebSocket at /ws/{user_id}

Events pushed to connected clients:
  deployment.status_changed  → update deployment record in context state
  incident.created           → prepend to incidents list + push notification
  incident.updated           → patch incident in context state
  rollback.progress          → update rollback operation audit logs
  plugin.sync_complete       → update plugin status and monitoring data
  notification.new           → increment unread count badge in header
```

---

## 8. AI Service Design (Phase 2)

### Input Context

```json
{
  "incident_title": "TypeScript Compiler Failure",
  "incident_description": "...",
  "error_message": "error TS2339: Property does not exist...",
  "build_logs": ["line1", "line2", "..."],
  "deployment_version": "v1.12.0",
  "provider": "netlify",
  "related_alerts": [{ "source": "sentry", "title": "TypeError", "count": 248 }]
}
```

### Output Format

```json
{
  "explanation": "2-3 sentence root cause summary",
  "confidence": 92,
  "causes": ["cause 1", "cause 2", "cause 3"],
  "steps": [
    { "title": "Step title", "description": "Step detail" },
    { "title": "You can mark the incident as resolved", "description": "", "isResolveLink": true }
  ]
}
```

Analysis results are cached in the `ai_analyses` table keyed by `incident_id`. Subsequent requests return the cached result.

---

## 9. Security Architecture

| Concern | Implementation |
|---------|----------------|
| Provider API tokens | Encrypted at rest in Supabase Vault; never returned to frontend |
| Webhook signature validation | HMAC-SHA1/SHA256 per provider spec |
| JWT sessions | Supabase Auth JWT; verified server-side on every request |
| Role-based access | `userProjectRole` computed from `teamMembers` table; enforced in both frontend UI and backend routes |
| Rate limiting | Applied to all public API routes via FastAPI middleware |
| Audit trail | Immutable audit log entries for all sensitive actions |
| Secrets in Git | Zero tolerance — all secrets in Kubernetes Secrets / Supabase Vault |
| CORS | Configured to allow only frontend origin(s) |
| Idempotent webhooks | Duplicate webhook event IDs detected and skipped |

---

## 10. Deployment Architecture Summary

| Component | Platform | Environment |
|-----------|----------|-------------|
| Frontend (React) | Vercel / Netlify | Production (no container) |
| Backend (FastAPI) | Kubernetes via ArgoCD | dev / staging / production |
| Database | Supabase (managed) | Supabase cloud instance |
| Container registry | GitHub Container Registry (GHCR) | — |
| GitOps controller | ArgoCD (in-cluster) | Kubernetes cluster |
| CI/CD | GitHub Actions | On push to `main` |
