# Incidents Page Redesign — Design

---

## Phase 1 — Frontend Layout Architecture

### View 1: Incident List (no incident selected)
```
┌─────────────────────────────────────────────────────────────────┐
│ Tab bar: All | Open | Critical• | Investigating | Resolved       │
├─────────────────────────────────────────────────────────────────┤
│ [× Severity: Critical] [× Status: Open]  Add filter... │Columns│
├─────────────────────────────────────────────────────────────────┤
│ 3 results / 6  │  Display 10 results ▾  │  Sort by Date ▾  │ ↕ │
├─────────────────────────────────────────────────────────────────┤
│ □  TITLE/PROJECT    SEVERITY   SOURCE   INFO        TAGS  STATUS│
├─────────────────────────────────────────────────────────────────┤
│ □  TypeScript...    🔴Critical  NF      devcorp/... ⚠    🔴Open │
│ □  Missing DB...    🟠High      VC      devcorp/... ⚠    🔵Inv. │
│ □  Checkout...      🟡Medium    GF      devcorp/...      ✅Res. │
└─────────────────────────────────────────────────────────────────┘
```

### View 2: Incident Detail (incident selected)
```
┌──────────────────────────────────────────┬──────────────────────┐
│ ← Back  /  Incidents  /  Incident Title  │                      │
│ [Provider Badge]  Incident Title          │ Details              │
│                                           │ ─────────────────── │
│ [Overview] [Locations] [Feedback] [Activity] │ Status: [🔴 Open] │
│ ─────────────────────────────────────────│ [Resolve ▾][Ignore ▾]│
│                                           │                      │
│ LEFT PANEL — tab content scrollable       │ Assignee: Daksh M.   │
│                                           │ Occurred: Aug 19     │
│  OVERVIEW:                                │ Detected: Aug 19     │
│  ┌─────────────────────────────┐          │ Opened for: 2h       │
│  │ Incident Details (kv table) │          │ Severity: Critical   │
│  └─────────────────────────────┘          │ Provider: netlify    │
│  ┌─────────────────────────────┐          │ Tags: [⚠ Exposed]    │
│  │ Build Logs (terminal block) │          │ Developer: daksh@... │
│  │ > Inspect Logs  > Rollback  │          │ ─────────────────── │
│  └─────────────────────────────┘          │ Related Alerts       │
│  ┌─────────────────────────────┐          │ [SN] TypeError #248  │
│  │ Related Alerts              │          │ ─────────────────── │
│  └─────────────────────────────┘          │ How to remediate     │
│                                           │ ○ Step 1 title       │
│  LOCATIONS:                               │   description text   │
│  ┌──────┐ ┌──────┐ ┌──────┐              │ ○ Step 2 title       │
│  │ 2    │ │ 5    │ │ 1    │              │   description text   │
│  │ Fail │ │ Occ. │ │ Open │              │ ✓ Mark as resolved   │
│  └──────┘ └──────┘ └──────┘              │                      │
│  Related Deployments table                │                      │
│                                           │                      │
│  FEEDBACK:                                │                      │
│  Is this real? [Yes] [False positive]     │                      │
│  Comment textarea + Submit                │                      │
│                                           │                      │
│  ACTIVITY:                                │                      │
│  [All][Actions][Comments]                 │                      │
│  Comment input + Submit                   │                      │
│  ○─── Timeline feed ──────────────────   │                      │
└──────────────────────────────────────────┴──────────────────────┘
```

---

## Component Structure

```
Incidents.tsx
├── State
│   ├── activeTab: 'overview' | 'locations' | 'feedback' | 'activity'
│   ├── listTab: 'all' | 'open' | 'critical' | 'investigating' | 'resolved'
│   ├── searchTerm: string
│   ├── selectedId: string | null  (replaces localActiveId)
│   ├── resolveOpen: boolean
│   ├── ignoreOpen: boolean
│   ├── resolveRef: RefObject<HTMLDivElement>
│   ├── ignoreRef: RefObject<HTMLDivElement>
│   ├── feedbackIsReal: boolean | null
│   ├── feedbackComment: string
│   ├── feedbackSubmitted: boolean  (for inline success message)
│   ├── activityFilter: 'all' | 'actions' | 'comments'
│   └── commentText: string
│
├── IncidentList  (selectedId === null)
│   ├── ListTabBar
│   ├── FilterChipsRow
│   ├── ResultsCountRow
│   └── IncidentTable
│       └── IncidentRow (×n)  [group hover, opacity-0 checkbox]
│
└── IncidentDetail  (selectedId !== null)
    ├── TopBar (back button + breadcrumb)
    ├── TitleRow (title + provider badge)
    ├── DetailTabBar [Overview | Locations | Feedback | Activity]
    ├── SplitLayout  (flex gap-6 items-start)
    │   ├── LeftPanel (flex-1 min-w-0 space-y-4 overflow-y-auto)
    │   │   ├── OverviewTab
    │   │   │   ├── IncidentDetailsKVCard
    │   │   │   ├── DeploymentLogsTerminal
    │   │   │   └── RelatedAlertsSection
    │   │   ├── LocationsTab
    │   │   │   ├── ImpactedPerimeterStats (3 boxes)
    │   │   │   └── RelatedDeploymentsTable
    │   │   ├── FeedbackTab
    │   │   │   ├── IsRealToggle
    │   │   │   ├── CommentTextarea
    │   │   │   └── SubmitButton + SuccessMessage
    │   │   └── ActivityTab
    │   │       ├── FilterButtons [All | Actions | Comments]
    │   │       ├── CommentInput + Submit
    │   │       └── TimelineFeed (merged timeline + comments)
    │   └── RightSidebar (w-80 shrink-0 sticky top-0)
    │       ├── StatusBadge
    │       ├── ResolveDropdown (useRef click-outside)
    │       ├── IgnoreDropdown (useRef click-outside)
    │       ├── DetailsKVList
    │       └── HowToRemediate
    │           ├── RemediationStep (×n, from getRemediationSteps())
    │           └── ResolveLink (always last, calls resolveIncident)
```

---

## Data Mapping

### Incident List Table Columns
| Column | Data Source | Notes |
|--------|-------------|-------|
| □ | checkbox | opacity-0, group-hover:opacity-100 |
| Title/Project | `incident.title` + `incident.projectName` | title = blue link |
| Severity | `incident.severity` | colored pill |
| Source | `incident.provider` or linked MonitoringAlert.source | small icon badge |
| Info | `incident.projectName` + `incident.assignedTo` | repo style |
| Tags | Derived tags (see below) | pill badges |
| Status | `incident.status` | colored pill |

**Derived tags logic:**
```ts
const tags: string[] = []
if (incident.severity === 'critical' || incident.severity === 'high') tags.push('⚠ High Priority')
if (incident.deploymentId) tags.push('🔀 Deploy Linked')
if (monitoringAlerts.some(a => a.incidentId === incident.id)) tags.push('📊 Alert Linked')
```

### Overview Tab Key-Value Fields
| Label | Source |
|-------|--------|
| Project | `incident.projectName` |
| Provider | `incident.provider` (badge) |
| Status | `incident.status` (badge) |
| Severity | `incident.severity` (badge) |
| Deployment ID | `incident.deploymentId \|\| '—'` |
| Commit Hash | `deployment?.commitHash \|\| '—'` (mono) |
| Commit Message | `deployment?.commitMessage \|\| '—'` |
| Branch | `deployment?.branch \|\| '—'` (mono) |
| Error | `deployment?.errorMessage` (text-red-400) |
| Suggested Action | `incident.suggestedAction \|\| '—'` |
| Created | `incident.createdAt` formatted |
| Resolved | `incident.resolvedAt \|\| 'Not yet'` |

### Activity Tab — Merge Logic
```ts
type ActivityItem = 
  | { kind: 'timeline'; event: string; timestamp: string; type: TimelineEventType }
  | { kind: 'comment'; comment: IncidentComment }

// Merge and sort ascending
const allActivity: ActivityItem[] = [
  ...incident.timeline.map(t => ({ kind: 'timeline', ...t })),
  ...incident.comments.map(c => ({ kind: 'comment', comment: c }))
].sort((a, b) => new Date(getTs(a)).getTime() - new Date(getTs(b)).getTime())

// Filter by activityFilter
if (activityFilter === 'actions') return allActivity.filter(
  a => a.kind === 'timeline' && (a.type === 'alert' || a.type === 'status_change')
)
if (activityFilter === 'comments') return allActivity.filter(
  a => a.kind === 'comment' || (a.kind === 'timeline' && a.type === 'comment')
)
```

### Remediation Steps — AI Parsing
```ts
interface RemediationStep {
  icon: LucideIcon
  title: string
  description: string
  isResolveLink?: boolean
}

function getRemediationSteps(deploymentId?: string, incidents?: Incident): RemediationStep[] {
  const ai = deploymentId ? aiExplanations[deploymentId] : undefined
  
  if (ai?.recommendations?.length) {
    const steps = ai.recommendations.map(rec => {
      // Split at first period or colon for title/description
      const splitIdx = rec.search(/[.:]/)
      const title = splitIdx > 0 ? rec.slice(0, splitIdx) : rec.slice(0, 40)
      const description = splitIdx > 0 ? rec.slice(splitIdx + 1).trim() : ''
      
      // Icon assignment by keyword
      let icon = ChevronRight
      if (/rollback|restore|revert/i.test(rec)) icon = RefreshCw
      else if (/variable|environment|config/i.test(rec)) icon = Settings
      else if (/log|examine|inspect|check/i.test(rec)) icon = Search
      else if (/fix|update|refactor|patch/i.test(rec)) icon = Code
      else if (/navigate|dashboard|open/i.test(rec)) icon = ExternalLink
      
      return { icon, title, description }
    })
    steps.push({ icon: CheckCircle, title: 'You can mark the incident as resolved', description: '', isResolveLink: true })
    return steps
  }
  
  // Generic fallback
  return [
    { icon: Search, title: 'Investigate the root cause', description: 'Review deployment logs and error messages to identify what triggered this incident.' },
    { icon: RefreshCw, title: 'Attempt recovery', description: 'Consider rolling back to the last known stable deployment version.' },
    { icon: CheckCircle, title: 'You can mark the incident as resolved', description: '', isResolveLink: true },
  ]
}
```

### Relative Time Helper
```ts
function relativeTime(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 2) return 'just now'
  if (mins < 60) return `${mins} minutes ago`
  if (hours < 24) return `about ${hours} hour${hours !== 1 ? 's' : ''} ago`
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function openedFor(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime()
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (hours < 1) return 'Less than 1 hour'
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''}`
  return `${days} day${days !== 1 ? 's' : ''}`
}
```

---

## Visual Design Spec

### Color Tokens
| Element | Class |
|---------|-------|
| Panel bg | `bg-white/[0.03]` |
| Panel border | `border-white/[0.06]` |
| Tab active | `border-b-2 border-white text-white pb-3` |
| Tab inactive | `text-zinc-500 hover:text-zinc-300 pb-3` |
| Critical badge | `bg-red-500/15 text-red-400 border border-red-500/25` |
| High badge | `bg-orange-500/10 text-orange-400 border border-orange-500/20` |
| Medium badge | `bg-amber-500/10 text-amber-400 border border-amber-500/20` |
| Low badge | `bg-zinc-500/10 text-zinc-400 border border-zinc-500/20` |
| Open status | `bg-red-500/10 text-red-400 border border-red-500/20` |
| Investigating | `bg-blue-500/10 text-blue-400 border border-blue-500/20` |
| Resolved | `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20` |
| Resolve button | `bg-white text-black hover:bg-zinc-200` |
| Ignore button | `bg-zinc-900 text-zinc-300 border border-white/[0.06]` |
| Remediate icon | `w-6 h-6 rounded-full border border-white/[0.06] bg-white/[0.03]` |
| Resolve link | `text-blue-400 hover:underline cursor-pointer` |
| Table row hover | `hover:bg-white/[0.02] transition-colors group` |
| Checkbox default | `opacity-0 group-hover:opacity-100 transition-opacity` |
| Log terminal | `bg-black/40 border border-white/[0.06] rounded-lg font-mono text-[11px]` |
| Error log line | `text-red-400` |
| Success log line | `text-emerald-400` |
| Normal log line | `text-zinc-500` |
| Line number | `text-zinc-700 select-none w-6 text-right mr-3` |
| Filter chip | `bg-white/[0.03] border border-white/[0.06] text-zinc-400 text-[10px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1` |
| Chip dismiss × | `text-zinc-600 hover:text-zinc-300 cursor-pointer` |
| Timeline connector | `absolute left-3 top-6 bottom-0 w-px bg-white/[0.06]` |
| Source badge NF | `bg-teal-500/10 text-teal-400 border border-teal-500/20` |
| Source badge VC | `bg-zinc-500/10 text-zinc-200 border border-zinc-500/20` |
| Source badge GF | `bg-orange-500/10 text-orange-400 border border-orange-500/20` |
| Source badge DD | `bg-purple-500/10 text-purple-400 border border-purple-500/20` |
| Source badge SN | `bg-violet-500/10 text-violet-400 border border-violet-500/20` |

### Dropdown Menus (Resolve / Ignore)
```
Position: absolute top-full left-0 mt-1
Width: w-64
Background: bg-[#0a0a0a] border border-white/[0.06] rounded-lg shadow-xl z-30
Option: px-4 py-2.5 text-xs text-zinc-300 hover:bg-white/[0.03] hover:text-white cursor-pointer transition-colors
```

### Timeline Event Icons
| Type | Icon | Color |
|------|------|-------|
| alert | AlertTriangle | text-red-400 |
| comment | MessageSquare | text-zinc-400 |
| status_change | CheckCircle | text-emerald-400 |
| action | Zap | text-blue-400 |

---

## Phase 2 — Backend Architecture

### Stack
```
Frontend (React + Vite)
  │  deployed on Vercel / Netlify
  ↕ REST + WebSocket
FastAPI Backend (Python 3.11+)
  │  containerized via Docker
  │  deployed to Kubernetes via ArgoCD (GitOps)
  ↕
Supabase PostgreSQL (database + auth + storage)
  ↕
External APIs:
  - Vercel REST API (v6/v9)
  - Netlify REST API (v1)
  - GitHub API (v3)
  - Grafana HTTP API
  - Datadog API (v1/v2)
  - Sentry API
  - LLM API (OpenAI GPT-4o-mini / Groq free tier)
```

### ArgoCD GitOps Deployment Model
```
Developer pushes code
        │
        ▼
GitHub Repository
  ├── backend/          ← FastAPI source code
  ├── k8s/              ← Kubernetes manifests (ArgoCD watches this)
  │   ├── base/
  │   │   ├── deployment.yaml
  │   │   ├── service.yaml
  │   │   ├── configmap.yaml
  │   │   └── ingress.yaml
  │   └── overlays/
  │       ├── dev/
  │       ├── staging/
  │       └── production/
  └── .github/
      └── workflows/
          └── build-push.yml   ← builds Docker image, pushes to registry
                │
                ▼
        Container Registry
        (Docker Hub / GHCR)
                │
                ▼
         ArgoCD watches k8s/overlays/{env}
                │
                ▼
       Kubernetes Cluster
       ├── namespace: idp-dev
       ├── namespace: idp-staging
       └── namespace: idp-production
           ├── Deployment (FastAPI backend pods)
           ├── Service (ClusterIP + LoadBalancer/Ingress)
           ├── ConfigMap (non-secret config)
           └── Secret (from Kubernetes Secrets / Vault)
```

### Kubernetes Manifest Structure
```
k8s/
├── base/
│   ├── deployment.yaml          # FastAPI deployment, 2 replicas
│   ├── service.yaml             # ClusterIP service on port 8000
│   ├── configmap.yaml           # Non-sensitive env vars (CORS origins, log level)
│   ├── ingress.yaml             # Nginx ingress with TLS
│   └── hpa.yaml                 # HorizontalPodAutoscaler (min 2, max 6)
└── overlays/
    ├── dev/
    │   ├── kustomization.yaml
    │   └── patch-replicas.yaml  # 1 replica for dev
    ├── staging/
    │   ├── kustomization.yaml
    │   └── patch-env.yaml       # staging Supabase URL
    └── production/
        ├── kustomization.yaml
        └── patch-replicas.yaml  # 3 replicas for production
```

### ArgoCD Application Manifest (per environment)
```yaml
# argocd/application-production.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: idp-backend-production
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/Dakshmulundkar/Internal-Developer-Platform
    targetRevision: main
    path: k8s/overlays/production
  destination:
    server: https://kubernetes.default.svc
    namespace: idp-production
  syncPolicy:
    automated:
      prune: true        # Remove resources deleted from Git
      selfHeal: true     # Correct any manual drift automatically
    syncOptions:
      - CreateNamespace=true
```

### CI/CD Pipeline (GitHub Actions → ArgoCD)
```yaml
# .github/workflows/build-push.yml
# Trigger: push to main branch
# Steps:
# 1. Build Docker image: docker build -t ghcr.io/dakshmulundkar/idp-backend:{sha}
# 2. Push to GitHub Container Registry
# 3. Update k8s/overlays/production/kustomization.yaml with new image tag
# 4. Commit and push the manifest update
# 5. ArgoCD detects the change and automatically syncs the new image to the cluster

# Image tag strategy: use Git SHA (short) for immutability
# e.g. ghcr.io/dakshmulundkar/idp-backend:a1b2c3d
```

### Kubernetes Deployment Spec (base)
```yaml
# k8s/base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: idp-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: idp-backend
  template:
    metadata:
      labels:
        app: idp-backend
    spec:
      containers:
        - name: idp-backend
          image: ghcr.io/dakshmulundkar/idp-backend:latest  # overridden by kustomize
          ports:
            - containerPort: 8000
          envFrom:
            - configMapRef:
                name: idp-config
            - secretRef:
                name: idp-secrets       # Supabase keys, webhook secrets, LLM keys
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 15
            periodSeconds: 20
          resources:
            requests:
              cpu: "100m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
```

### Backend Folder Structure
```
backend/
├── main.py                    # FastAPI app entry point
├── config.py                  # Settings from env vars
├── database.py                # Supabase client setup
├── models/                    # Pydantic schemas
│   ├── user.py
│   ├── project.py
│   ├── deployment.py
│   ├── incident.py
│   ├── rollback.py
│   ├── notification.py
│   ├── plugin.py
│   └── audit.py
├── routers/                   # FastAPI routers
│   ├── auth.py               # /auth/*
│   ├── projects.py           # /projects/*
│   ├── deployments.py        # /deployments/*
│   ├── incidents.py          # /incidents/*
│   ├── rollback.py           # /rollback/*
│   ├── plugins.py            # /plugins/*
│   ├── notifications.py      # /notifications/*
│   ├── audit.py              # /audit/*
│   └── ai.py                 # /ai/*
├── services/                  # Business logic
│   ├── vercel_service.py
│   ├── netlify_service.py
│   ├── github_service.py
│   ├── grafana_service.py
│   ├── datadog_service.py
│   ├── sentry_service.py
│   ├── ai_service.py
│   ├── incident_service.py
│   └── webhook_service.py
├── webhooks/                  # Webhook receivers
│   ├── vercel_webhook.py
│   ├── netlify_webhook.py
│   ├── grafana_webhook.py
│   ├── datadog_webhook.py
│   └── sentry_webhook.py
├── background/                # Background tasks
│   ├── plugin_sync.py
│   └── incident_monitor.py
├── middleware/
│   ├── auth_middleware.py
│   └── rate_limiter.py
└── Dockerfile                 # Multi-stage build: builder + slim runtime
```

### Dockerfile (multi-stage)
```dockerfile
# Stage 1: builder
FROM python:3.11-slim AS builder
WORKDIR /app
COPY pyproject.toml .
RUN pip install --no-cache-dir build && pip install .

# Stage 2: runtime
FROM python:3.11-slim AS runtime
WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11 /usr/local/lib/python3.11
COPY . .
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s CMD curl -f http://localhost:8000/health || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### Supabase Database Schema
```sql
-- Users managed by Supabase Auth
-- projects
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  repo_owner TEXT,
  repo_name TEXT,
  branch TEXT DEFAULT 'main',
  provider TEXT NOT NULL,  -- 'vercel' | 'netlify'
  environment TEXT DEFAULT 'production',
  status TEXT DEFAULT 'queued',
  owner_id UUID REFERENCES auth.users(id),
  vercel_project_id TEXT,
  netlify_site_id TEXT,
  webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- deployments
CREATE TABLE deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  version TEXT,
  status TEXT,
  commit_hash TEXT,
  commit_message TEXT,
  branch TEXT,
  author TEXT,
  author_avatar TEXT,
  provider TEXT,
  duration_ms INTEGER DEFAULT 0,
  url TEXT,
  logs JSONB,
  stages JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- incidents
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  deployment_id UUID REFERENCES deployments(id),
  severity TEXT,       -- 'low' | 'medium' | 'high' | 'critical'
  provider TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open',
  assigned_to TEXT,
  ignored_reason TEXT,
  feedback_is_real BOOLEAN,
  feedback_comment TEXT,
  suggested_action TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- incident_comments
CREATE TABLE incident_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id),
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  user_avatar TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- incident_timeline
CREATE TABLE incident_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id),
  event TEXT NOT NULL,
  type TEXT,  -- 'alert' | 'comment' | 'action' | 'status_change'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- rollback_operations
CREATE TABLE rollback_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  failed_deployment_id UUID REFERENCES deployments(id),
  target_deployment_id UUID REFERENCES deployments(id),
  target_version TEXT,
  status TEXT DEFAULT 'queued',
  initiated_by UUID REFERENCES auth.users(id),
  error TEXT,
  audit_logs JSONB DEFAULT '[]',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- notifications
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  title TEXT,
  message TEXT,
  type TEXT,
  project_id UUID REFERENCES projects(id),
  incident_id UUID REFERENCES incidents(id),
  deployment_id UUID REFERENCES deployments(id),
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- plugin_installations
CREATE TABLE plugin_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id TEXT NOT NULL,
  plugin_name TEXT,
  category TEXT,
  status TEXT DEFAULT 'disconnected',
  api_key_encrypted TEXT,  -- encrypted via Supabase Vault
  base_url TEXT,
  project_selector TEXT,
  webhook_url TEXT,
  last_sync_at TIMESTAMPTZ,
  installed_by UUID REFERENCES auth.users(id),
  enabled_for_projects JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- monitoring_alerts
CREATE TABLE monitoring_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT,
  title TEXT,
  description TEXT,
  severity TEXT,
  status TEXT DEFAULT 'firing',
  project_id UUID REFERENCES projects(id),
  deployment_id UUID REFERENCES deployments(id),
  incident_id UUID REFERENCES incidents(id),
  labels JSONB,
  value TEXT,
  threshold TEXT,
  fired_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- audit_logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  action TEXT,
  project_id UUID REFERENCES projects(id),
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Frontend API Service Layer
```ts
// src/services/api.ts — replaces direct context mutations
const API_BASE = import.meta.env.VITE_API_URL || ''

// When VITE_API_URL is set: real backend calls
// When not set: fall through to localStorage/seedData (demo mode)

export const api = {
  incidents: {
    list: () => fetch(`${API_BASE}/incidents`),
    get: (id: string) => fetch(`${API_BASE}/incidents/${id}`),
    resolve: (id: string, reason: string) => fetch(`${API_BASE}/incidents/${id}/resolve`, { method: 'POST', body: JSON.stringify({ reason }) }),
    ignore: (id: string, reason: string) => fetch(`${API_BASE}/incidents/${id}/ignore`, { method: 'POST', body: JSON.stringify({ reason }) }),
    comment: (id: string, content: string) => fetch(`${API_BASE}/incidents/${id}/comments`, { method: 'POST', body: JSON.stringify({ content }) }),
    feedback: (id: string, isReal: boolean, comment: string) => fetch(`${API_BASE}/incidents/${id}/feedback`, { method: 'POST', body: JSON.stringify({ is_real: isReal, comment }) }),
  },
  // ... deployments, projects, rollback, ai, plugins
}
```

### AI Service Design
```
Input context to LLM:
{
  "incident_title": "...",
  "incident_description": "...",
  "error_message": "...",
  "build_logs": ["..."],
  "deployment_version": "...",
  "provider": "vercel|netlify",
  "related_alerts": [...]
}

Prompt template:
"You are an expert DevOps assistant. Analyze this deployment incident and provide:
1. A brief explanation of the root cause (2-3 sentences)
2. A confidence score (0-100) for your analysis
3. A list of 3-5 specific remediation steps (each as {title, description})
4. The final step must always be: mark the incident as resolved

Respond in JSON format only."

Output:
{
  "explanation": "...",
  "confidence": 92,
  "causes": ["..."],
  "steps": [
    { "title": "...", "description": "..." },
    ...
    { "title": "You can mark the incident as resolved", "description": "", "isResolveLink": true }
  ]
}
```

### WebSocket / SSE Design
```
Backend: FastAPI WebSocket at /ws/{user_id}

Events pushed to frontend:
- deployment.status_changed → update deployment in state
- incident.created → add to incidents list, show notification
- incident.updated → update incident in state
- rollback.progress → update rollback operation
- plugin.sync_complete → update plugin status
- notification.new → update notification count badge
```
