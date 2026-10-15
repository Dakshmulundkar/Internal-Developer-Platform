# Aether IDP — Internal Developer Platform for Self-Service Delivery and Recovery

A professional, centralized control-plane web platform for software teams to manage, monitor, and recover applications deployed on external hosting providers. Built as a final-year engineering project by **Daksh Mulundkar**.

> **Version 2.1** — Includes the full audit pass (code splitting, bug fixes, security hardening) and the complete team invite flow (email + in-platform notifications).

> **Deploy (free, $0/mo):** Frontend → Vercel, Backend → Render, DB → Supabase. Full steps in [`DEPLOY.md`](./DEPLOY.md).

---

## Installation (Windows & Linux)

**Requirements:** Node.js 18+ (20 recommended), Python 3.11+, Git. Docker optional (only for §7 container run).

### Windows (PowerShell)

```powershell
# Node 20 LTS: winget install OpenJS.NodeJS.LTS  (or https://nodejs.org)
# Python 3.11: winget install Python.Python.3.11  (tick "Add to PATH")
# Git: winget install Git.Git

git clone https://github.com/Dakshmulundkar/Internal-Developer-Platform.git
cd Internal-Developer-Platform
npm install
npm run setup          # copies .env files + creates backend/venv + installs deps
# fill backend/.env (SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY, FERNET_KEY)
npm run dev            # Vite :5174 + backend :8001
```

### Linux (Ubuntu/Debian)

```bash
# Node 20 + Git + Python:
sudo apt update && sudo apt install -y git python3 python3-venv curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v  # must be v18+

git clone https://github.com/Dakshmulundkar/Internal-Developer-Platform.git
cd Internal-Developer-Platform
npm install
bash scripts/setup.sh   # same as npm run setup on Linux
# fill backend/.env (SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY, FERNET_KEY)
npm run dev             # Vite :5174 + backend :8001
```

Open **http://localhost:5174**. No `VITE_API_URL` = demo seed-data mode (works offline).

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
│  Deployed: Render Free (K8s + ArgoCD optional, see DEPLOY.md) │
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

## 6. Quick Start (Demo Mode — 3 Commands)

Prerequisites installed above. **No backend, Docker, or database required.**

### Install and Run (if you skipped Installation above)

```bash
git clone https://github.com/Dakshmulundkar/Internal-Developer-Platform.git
cd Internal-Developer-Platform
npm install
npm run setup          # Windows: scripts/setup.ps1 · Linux: scripts/setup.sh
npm run dev
```

Open **http://localhost:5174** — the platform loads in demo mode with seed data. (The dev server is pinned to 5174 via `strictPort`; if `npm run dev` also starts the backend, it listens on 8001.)

### Login (Demo Mode)
- Enter any email and a password of 6+ characters, or click the GitHub / Google OAuth buttons.
- All data is stored in `localStorage` and populated from `src/data/seedData.ts`.

### Build for Production

```bash
npm run build
```

---

## 7. Full Stack (Recommended: Docker Compose)

Runs everything in containers: backend on `:8000`, frontend (nginx) on `:5173`.

**Prerequisites:** Docker (standalone `docker-compose` and the `docker compose` plugin both work) and a Supabase project.

### Steps

1. **Install and scaffold** (copies `backend/.env.example` → `backend/.env`, creates the Python venv, installs deps):
```bash
npm install
npm run setup
```

2. **Fill `backend/.env`.** Required keys:
   - `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY` — Supabase project → Settings → API
   - `FERNET_KEY` — encrypts stored plugin credentials (generation command inside `backend/.env.example`)

   Every other key (AI, GitHub OAuth, invite emails, webhook secrets, provider tokens) is optional and documented in `backend/.env.example`.

3. **Run the database schema** — in the Supabase SQL editor, run each file once:
   - `backend/supabase_schema.sql`
   - `backend/supabase_schema_additions.sql`
   - `backend/security_triage_schema.sql`
   - `backend/incident_feedback_schema.sql`
   - `backend/autofix_schema.sql`

> **Deploying (free)?** Follow [`DEPLOY.md`](./DEPLOY.md) — Vercel (frontend) + Render Free (backend, `render.yaml` included) + UptimeRobot ping to stop cold starts.

4. **Build and start:**
```bash
docker-compose up --build
```

5. **Open http://localhost:5173** and sign in. Health check: **http://localhost:8000/health** — may report `"status": "degraded"` with a `config_warnings` array naming missing variables. Fill those keys in `backend/.env` and restart.

---

## 7b. Full Stack (Local Dev Without Docker)

1. `npm run setup` — creates `backend/.env` from the example + Python venv.
2. Fill `backend/.env` — required keys listed in §7 step 2 (full reference: `backend/.env.example`).
3. In the root `.env` (created by setup), set `VITE_USE_API=true` — enables API mode through the Vite dev-server proxy.
4. `npm run dev` — starts Vite (`:5174`) and the backend (`:8001`) together.
5. Open **http://localhost:5174**.

To run the backend on its own (inside the venv created by `npm run setup`):

```bash
pip install -U -e "./backend[dev]"    # from repo root — installs Python dependencies only
cd backend
python -m uvicorn main:app --reload --port 8001
```

> **Packaging reality:** the backend is a flat layout with **no importable package** — installing it installs *dependencies only*; the app is always run from the `backend/` directory (running it from the repo root fails with `ModuleNotFoundError: No module named 'main'`). Port **8001** is what the Vite dev proxy targets — running on 8000 breaks local dev.

---

## 7c. Advanced — Kubernetes + ArgoCD (GitOps)

**Prerequisites:** Docker, a Kubernetes cluster (local: [kind](https://kind.sigs.k8s.io/) or [minikube](https://minikube.sigs.k8s.io/)), ArgoCD installed in the cluster, and the 3 SQL files from §7 step 3 already run against Supabase.

### Backend Environment Variables

If `npm run setup` has not run yet, copy **`backend/.env.example`** to `backend/.env` and fill in (never commit `.env`):

```
# REQUIRED — /health reports "degraded" while these are empty
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJ...
SUPABASE_SERVICE_KEY=eyJ...
FERNET_KEY=...                     # encrypts plugin credentials
# CORS — must include your frontend origin
CORS_ORIGINS=http://localhost:5174,http://localhost:5173,https://your-frontend.vercel.app
#                ^dev            ^Docker frontend     ^production
# AI analysis (optional — set at least one)
GROQ_API_KEY=...                   # primary (free tier)
OPENAI_API_KEY=sk-...              # fallback
# GitHub OAuth (optional)
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
# Public URLs for OAuth redirects and invite accept/decline links (optional)
APP_FRONTEND_URL=http://localhost:5174   # Docker frontend: http://localhost:5173
APP_BACKEND_URL=http://localhost:8001    # Docker backend: http://localhost:8000
# Team invite emails via Resend (optional — falls back to console log)
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=Aether IDP
# Webhook signature verification (optional)
VERCEL_WEBHOOK_SECRET=whsec_...
NETLIFY_WEBHOOK_SECRET=whsec_...
```

> The backend reads `backend/.env` directly. The **root** `.env` is for the *frontend* (Vite) only.

### Run the Backend Locally

```bash
cd backend
python -m uvicorn main:app --reload --port 8001
```
Run inside the venv created by `npm run setup`; install deps first with `pip install -U -e "./backend[dev]"` from the repo root (dependencies only — see §7b). Port **8001** is required for the Vite dev proxy.

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

When `VITE_API_URL` and `VITE_USE_API` are both unset, the frontend automatically falls back to demo/seed data mode.

---

## 7d. How to Update

```bash
npm run update
```

Pulls the latest code (`git pull --ff-only`); when the Docker daemon is reachable it rebuilds/restarts the Compose stack and polls backend `/health`, otherwise it falls back to refreshing dependencies (`npm ci` + backend pip install) and asks you to restart `npm run dev`. Idempotent — safe to run repeatedly; ends with a clear `UPDATED-HEALTHY` / `UPDATED-HEALTH-DEGRADED` / `FAILED` status line.

For diagnostics (Node version, ports 5174 dev / 8001 backend / 5173 Docker, `backend/.env` keys, venv, backend `/health` ok-or-degraded with warnings), run **`npm run doctor`** — exits non-zero if any check fails.

---

## 7e. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Port 5174 already in use | Another Vite instance or Docker Desktop is holding the port (the dev server uses `strictPort`). Close the other process or stop Docker Desktop. |
| "Docker daemon not running" | The Compose path (§7) needs Docker running. Use local dev instead (§7b). |
| Seeing demo data with the backend running | Frontend is in demo mode — `VITE_USE_API` / `VITE_API_URL` unset in `.env`, or the backend is down. Run `npm run doctor`. |
| CORS error in the browser | `CORS_ORIGINS` in `backend/.env` must include your frontend origin (`http://localhost:5174` for dev). |
| Supabase "relation does not exist" errors | Run the 3 SQL files in the Supabase SQL editor (§7 step 3). |
| `/health` reports `degraded` | Its `config_warnings` list the missing env keys — fill them in `backend/.env` and restart. |

---

## 7f. Repo Auto-Fix (beta)

Connect a classic GitHub PAT and the platform can scan a linked repository,
generate a missing Dockerfile, auto-fix safe lint errors, push everything to a
**new `aether/autofix-*` branch**, and open a pull request. Your default branch
is never touched.

**Setup (run this SQL file once in the Supabase SQL editor, after the files in §7 step 3):**
- `backend/autofix_schema.sql`

**Use:**
1. **Settings → GitHub Auto-Fix** — paste a classic PAT with the `repo` scope
   ([create one here](https://github.com/settings/tokens)). The token is
   encrypted at rest; the UI shows only `@login (…last4)`.
2. Open a project → **Infrastructure tab → Repo Health → Scan repository**.
3. Review findings → **Apply fixes & open PR** → review the PR on GitHub.

**What Apply does in one run:** generates a missing Dockerfile (template, never
overwrites) → runs your linters' `--fix` → optionally fixes *small* problems
with OpenAI (only files with ≤5 errors and ≤30 KB, max 5 per run; each fix is
re-linted and kept only if errors drop) → pushes to a new `aether/autofix-*`
branch → opens a PR. Problems too large to automate become **triage tickets**
on the Incidents page instead (they land in the same incidents table as every
other ticket, with the likely cause attached).
AI fixes need `OPENAI_API_KEY` in `backend/.env`; without it, mechanical fixes
and tickets still work.

**Honest limitations:**
- **Trusted repos only:** applying runs the repo's own tooling (`npm ci`,
  ESLint plugins) on the server — only auto-fix repos you trust.
- **200 MB cap:** larger repos can scan but not apply.
- **JS fixes need a lockfile** (`package-lock.json` etc.); **ruff fixes need a
  ruff config** — otherwise those checks report as skipped with a reason.
- **10 applies / 20 scans per user per day.**
- Revoke anytime: Settings → GitHub Auto-Fix → Disconnect (also revoke the
  token at github.com/settings/tokens).

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
