# Aether IDP — Internal Developer Platform for Self-Service Delivery and Recovery

A professional, centralized control-plane web platform for software teams to manage, monitor, and recover applications deployed on external hosting providers. Built as a final-year engineering project by **Daksh Mulundkar**.

> **Version 2.1** — Includes the full audit pass (code splitting, bug fixes, security hardening) and the complete team invite flow (email + in-platform notifications).

---

## Project Title

**Design and Implementation of an Internal Developer Platform for Self-Service Delivery and Recovery**

---

## 1. Overview

Modern engineering teams deploy web applications across multiple external cloud platforms such as Vercel and Netlify. Managing these disconnected deployments requires checking several dashboards, configuring projects manually, and diagnosing failures without a common workflow.

This Internal Developer Platform (IDP) acts as a **centralized management and operational recovery layer**:

- **Control Plane Architecture** — The platform does not host or replace user applications. Code continues running on Vercel or Netlify.
- **Plugin-Based Integration Model** — External tools (Grafana, Datadog, Sentry) connect through plugins. Each plugin normalizes provider-specific events into a common internal format.
- **Self-Service Onboarding** — Developers register GitHub repositories, configure environments, and hook build pipelines in a guided multi-step wizard.
- **Unified Health Monitoring** — Consolidates deployment statuses, build logs, monitoring alerts, and incident tickets into a single dark-themed dashboard.
- **Automated Incident Management** — Incidents are opened automatically when deployments fail or monitoring alerts fire. Each incident has a full detail view with tabs for Overview, Locations, Feedback, and Activity.
- **Aether AI Diagnosis** — Evaluates error messages, build logs, and alert context to generate confidence scores, root cause breakdowns, and AI-generated remediation checklists.
- **Controlled Rollback & Recovery** — Operators restore previous stable deployment versions via the provider API with confirmation modals and full audit trail retention.
- **Team Invite Flow** — Admins invite members by email. Invitees receive a styled email via Resend **and** an in-platform banner notification (if they already have an Aether account) allowing one-click Accept/Decline without leaving the site.
- **GitOps Deployment via ArgoCD** — The backend is deployed to Kubernetes using ArgoCD, which continuously syncs the cluster state from the Git repository.

---

## 2. Architecture

### Frontend ↔ Backend ↔ Providers

```
┌─────────────────────────────────────────────┐
│  Aether IDP Web Portal                       │
│  React 18 + TypeScript + Vite + Tailwind CSS │
│  Deployed: Vercel / Netlify                  │
└───────────────────┬─────────────────────────┘
                    │ REST + WebSocket
┌───────────────────▼─────────────────────────┐
│  FastAPI Backend (Python 3.11)               │
│  Deployed: Kubernetes via ArgoCD (GitOps)    │
└────┬──────────────┬──────────────────────────┘
     │              │
     ▼              ▼
Supabase         External Provider APIs
PostgreSQL       ├── Vercel REST API (v6/v9)
Auth + Storage   ├── Netlify REST API (v1)
                 ├── GitHub API (v3)
                 ├── Grafana HTTP API
                 ├── Datadog API (v1/v2)
                 ├── Sentry API
                 └── LLM API (OpenAI / Groq)
```

### GitOps Delivery Pipeline (ArgoCD)

```
Developer pushes to main
        │
        ▼
GitHub Actions CI
  1. Build Docker image (multi-stage)
  2. Push to GHCR tagged with Git SHA
  3. Update k8s/overlays/production/kustomization.yaml
  4. Commit manifest change
        │
        ▼
ArgoCD detects manifest change
  → Syncs new image to Kubernetes cluster
  → selfHeal corrects any manual drift
  → 3 environments: idp-dev / idp-staging / idp-production
```

### Plugin Data Flow

```
External Provider API / Webhook
              │
              ▼
      Plugin Adapter (per provider)
              │
              ▼
      Event Normalizer
              │
              ▼
      Core IDP Services
    ┌────┬────┬──────┬──────────┐
    ▼    ▼    ▼      ▼          ▼
Dashboard Alerts Incidents AI Context Rollback
```

### Demo / Offline Mode

When no backend is configured (`VITE_API_URL` not set), the platform loads realistic seed data from `src/data/seedData.ts` — 5 projects, multi-stage build logs, open incidents, rollback history — ensuring the platform is fully demonstrable offline.

---

## 3. Pages & Modules

| Page | File | Description |
|------|------|-------------|
| Login & Auth | `Login.tsx` | Email/password, GitHub OAuth, Google OAuth. Demo mode accepts any credentials. |
| Dashboard | `Dashboard.tsx` | 6 metric cards, deployment success chart, incident trend, monitoring alert trend, 5-provider health panel, audit trail. |
| Projects | `Projects.tsx` | Service catalog with plugin badges, status indicators, search and filter. |
| Create Project Wizard | `CreateProjectWizard.tsx` | 6-step guided onboarding: metadata → repo → provider → branch → credentials → review. |
| Project Details | `ProjectDetails.tsx` | Deployment history, incident alerts, rollback and AI diagnosis shortcuts. |
| Deployments | `Deployments.tsx` | Full deployment timeline table with status badges, commit info, filtering. |
| Deployment Details | `DeploymentDetails.tsx` | Build stage progression, terminal logs, AI root cause analysis, rollback modal. |
| Incidents | `Incidents.tsx` | GitGuardian-style list with tab filters, split detail view with 4 tabs (Overview / Locations / Feedback / Activity), AI remediation checklist in right sidebar. |
| Rollback & Recovery | `RollbackRecovery.tsx` | Controlled rollback workflow, target version selection, live audit log, confirmation step. |
| AI Assistant | `AIAssistant.tsx` | Chat-style diagnosis interface, context selector, confidence scores, root cause breakdown. |
| Monitoring | `Monitoring.tsx` | Unified alert view (Grafana / Datadog / Sentry), Sentry issues tab with stack traces. |
| Integrations | `Integrations.tsx` | Plugin marketplace — install, configure, test, and remove plugins. |
| Plugin Config | `PluginConfig.tsx` | API key (masked), base URL, webhook URL display, connection test, enabled-for-projects. |
| Notifications | `Notifications.tsx` | Full alert feed, read/unread tracking, click-through to related incident or deployment. |
| Automation | `Automation.tsx` | IF/WHEN/THEN automation rules with Jira-like ribbon editor, drag-and-drop reorder (`sort_order`), dry-run testing, execution history. |
| Scheduled Tasks | `ScheduledTasks.tsx` | Recurring CRON tasks (email digest, reports, health checks, alert sync) with drag-and-drop cards, run-now, pause toggles, and live scheduler status. |
| Global Search | `SearchModal.tsx` | Ctrl+K / Cmd+K fuzzy search across projects, deployments, incidents, team members (Postgres FTS in API mode). |
| Settings | `Settings.tsx` | Provider connections, Grafana/Datadog/Sentry plugin status, notification preferences, user profile, team management with invite flow (dual delivery: email + in-platform banner). |
| Sharing | `ShareDialog.tsx` | Share incidents/deployments/projects via public token links (expiry + optional password), available from each detail page header. |

**Collaboration across detail pages** — comment threads with @-mention autocomplete, activity timelines, file attachments, and share links with expiry/password.
**Real-time updates** — WebSocket channel push keeps multiple users in sync when `VITE_WS_URL` is configured.
**Role-based access** — `viewer` role sees read-only detail pages (Resolve/Ignore/rollback/configure controls hidden).
**Team invite flow** — Admins invite by email from Settings. The invite is delivered both by email (Resend) and as an in-platform banner notification. The banner shows on every page until the invitee accepts or declines. Tokens expire in 7 days.

---

## 4. Technology Stack

### Frontend
| Technology | Purpose |
|-----------|---------|
| React 18 | UI framework |
| TypeScript 5 | Type safety |
| Vite 8 | Build tool and dev server |
| Tailwind CSS 3 | Utility-first styling |
| Lucide React | Icon library |
| Recharts | Deployment success, incident trend, monitoring alert charts |
| React Context API | Global state + localStorage persistence |

### Backend (Phase 2)
| Technology | Purpose |
|-----------|---------|
| Python 3.11 | Backend language |
| FastAPI | REST API framework |
| Pydantic | Data validation and schemas |
| Supabase | PostgreSQL database + Auth + Storage |
| Supabase Vault | Encrypted API key storage |
| WebSockets | Real-time event push to frontend |

### Infrastructure & DevOps
| Technology | Purpose |
|-----------|---------|
| Docker | Multi-stage image build for backend |
| Kubernetes | Container orchestration |
| ArgoCD | GitOps continuous delivery — syncs `k8s/` manifests to cluster |
| Kustomize | Environment overlays (dev / staging / production) |
| GitHub Actions | CI/CD — build, push image, update manifests |
| GitHub Container Registry | Docker image storage |

### External Integrations
| Integration | API Used |
|------------|---------|
| Vercel | REST API v6/v9 — deployments, rollback alias |
| Netlify | REST API v1 — deploys, restore |
| GitHub | REST API v3 — repos, commits, webhooks |
| Grafana | HTTP API — alerts, dashboards |
| Datadog | API v1/v2 — monitors, events |
| Sentry | REST API — issues, releases, stack traces |
| LLM | OpenAI GPT-4o-mini / Groq Llama3 — AI analysis |

---

## 5. Repository Structure

```
.
├── src/                          # React frontend
│   ├── components/               # Header, Sidebar
│   ├── context/                  # PlatformContext (global state)
│   ├── data/                     # seedData.ts (demo/offline mode)
│   ├── pages/                    # All 15 pages
│   ├── services/                 # providerApi.ts, api.ts (Phase 2)
│   └── types/                    # TypeScript types
├── public/                       # Static assets
├── backend/                      # FastAPI backend (Phase 2)
│   ├── main.py
│   ├── routers/                  # auth, projects, deployments, incidents, rollback, ai, plugins
│   ├── services/                 # vercel, netlify, grafana, datadog, sentry, ai
│   ├── webhooks/                 # webhook receivers per provider
│   ├── background/               # plugin sync, incident monitor
│   ├── middleware/               # auth, rate limiter
│   └── Dockerfile                # Multi-stage build
├── k8s/                          # Kubernetes manifests (ArgoCD watches this)
│   ├── base/                     # deployment, service, configmap, ingress, hpa
│   └── overlays/                 # dev / staging / production
├── argocd/                       # ArgoCD Application manifests
│   ├── application-dev.yaml
│   ├── application-staging.yaml
│   └── application-production.yaml
├── .github/
│   └── workflows/
│       └── build-push.yml        # CI: build Docker image → push → update manifest
├── .kiro/specs/incidents-redesign/ # Feature spec (requirements, design, tasks)
├── description.md                # Full project specification
└── README.md
```

---

## 6. Getting Started (Frontend / Demo Mode)

### Prerequisites
- Node.js v18+
- npm

### Install and Run

```bash
git clone https://github.com/Dakshmulundkar/Internal-Developer-Platform.git
cd Internal-Developer-Platform
npm install
npm run dev
```

Open `http://localhost:5173/` — the platform loads in demo mode with seed data. No backend required.

### Login (Demo Mode)
- Enter any email and a password of 6+ characters, or click the GitHub / Google OAuth buttons.
- All data is stored in `localStorage` and populated from `src/data/seedData.ts`.

### Build for Production

```bash
npm run build
```

---

## 7. Getting Started (Full Stack with Backend)

### Prerequisites
- Docker
- A Kubernetes cluster (local: [kind](https://kind.sigs.k8s.io/) or [minikube](https://minikube.sigs.k8s.io/))
- ArgoCD installed in the cluster
- A Supabase project

### Backend Environment Variables

Copy `.env.example` to `backend/.env` and fill in:

```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJ...
OPENAI_API_KEY=sk-...          # or GROQ_API_KEY for free tier
VERCEL_WEBHOOK_SECRET=whsec_...
NETLIFY_WEBHOOK_SECRET=whsec_...
CORS_ORIGINS=http://localhost:5173,https://your-frontend.vercel.app
# Team invite email (optional — falls back to console log)
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=Aether IDP
# Public URLs for invite accept/decline links
APP_FRONTEND_URL=https://your-frontend.vercel.app
APP_BACKEND_URL=https://your-api.yourdomain.com
```

### Run Backend Locally

```bash
cd backend
python -m venv venv && .\venv\Scripts\activate   # Windows
pip install -e .
uvicorn main:app --reload
```

> **Database setup** — run `backend/supabase_schema_additions.sql` once in the Supabase SQL editor to create all Phase 2 + Phase 2.1 tables: automation rules, scheduled tasks, sharing, comments, activity, team_members invite columns, and the new `notifications` table.

### Deploy Backend via ArgoCD

1. Build and push the Docker image:
```bash
docker build -t ghcr.io/dakshmulundkar/idp-backend:latest ./backend
docker push ghcr.io/dakshmulundkar/idp-backend:latest
```

2. Create Kubernetes secrets (never committed to Git):
```bash
kubectl create secret generic idp-secrets \
  --from-literal=SUPABASE_URL=... \
  --from-literal=SUPABASE_KEY=... \
  --from-literal=OPENAI_API_KEY=... \
  -n idp-production
```

3. Register ArgoCD applications:
```bash
kubectl apply -f argocd/ -n argocd
```

4. ArgoCD automatically syncs and deploys. Access the UI:
```bash
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

### Connect Frontend to Backend

Set environment variables in your Vercel/Netlify dashboard:
```
VITE_API_URL=https://api.your-cluster.com
VITE_WS_URL=wss://api.your-cluster.com
```

When `VITE_API_URL` is not set, the frontend automatically falls back to demo/seed data mode.

---

## 8. Incidents Page — Redesigned ✅

The incidents page has been redesigned to match a professional incident management tool (spec in `.kiro/specs/incidents-redesign/`):

- **List view** — full-width table with tab filters (Open / All / Critical / Investigating / Resolved), filter chips, source plugin badges per row
- **Split detail view** — left panel with 4 tabs (Overview / Locations / Feedback / Activity) + persistent right sidebar
- **Right sidebar** — Resolve ▾ and Ignore ▾ dropdown actions, details key-value list, AI-generated "How to remediate" checklist, always-last "You can mark the incident as resolved" link
- **Activity tab** — merged timeline + comments feed with relative timestamps and event type icons
- **Feedback tab** — real/false-positive toggle + comment textarea

---

## 9. Roadmap

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 — Frontend UI | ✅ Complete | All 15 pages, plugin system, monitoring, dark theme, demo mode |
| Incidents Redesign | ✅ Complete | GitGuardian-style incident detail view (see `.kiro/specs/`) |
| Phase 2 — Backend | ✅ Complete | FastAPI + Supabase — real auth, deployments, incidents, webhooks |
| Phase 2 — AI | ✅ Complete | Real LLM API (OpenAI / Groq fallback) for incident analysis |
| Phase 2 — Plugins | ✅ Complete | Live Grafana, Datadog, Sentry data sync |
| Phase 2 — Team / RBAC | ✅ Complete | Team management + role enforcement |
| Phase 2 — Automation & Scheduling | ✅ Complete | Automation rules + CRON tasks with Jira-style catalog + composer UI, drag-and-drop reorder |
| Phase 2 — Search & Sharing | ✅ Complete | Postgres FTS global search (Ctrl+K) + public token share links + standalone ShareView |
| Phase 2 — ArgoCD | ✅ Complete | K8s manifests + ArgoCD applications + GitHub Actions CI |
| Phase 2 — Dashboard Customization | ✅ Complete | Drag-to-reorder widget layout + show/hide toggle, persisted to localStorage |
| Phase 2 — JWT Refresh | ✅ Complete | Silent token refresh via `/auth/refresh` — sessions survive Supabase access-token expiry |
| **Remaining** | | |
| Run schema SQL | ⏳ Pending | Execute `backend/supabase_schema_additions.sql` in Supabase, then restart uvicorn |

---

## 10. Evaluation Metrics

- **Type Safety** — `tsc --noEmit` passes with 0 errors
- **Onboarding Latency** — Project wizard completes in under 10 seconds
- **Recovery Auditing** — 100% of rollback operations create immutable audit records
- **Demo Mode** — Platform is fully functional offline with no external dependencies
- **GitOps Compliance** — All backend infrastructure changes tracked and deployed through Git via ArgoCD

---

## 11. Author

**Daksh Mulundkar**
GitHub: [@Dakshmulundkar](https://github.com/Dakshmulundkar)

Final-year engineering project — Internal Developer Platform for Self-Service Delivery and Recovery.
