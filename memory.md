# Project Memory
# Aether IDP — Internal Developer Platform

> This file is the single source of truth for the current state of the project.
> Update it whenever a phase, task, or architectural decision changes.
> Read this file first when resuming work after a break.

---

## Project Identity

| Field | Value |
|-------|-------|
| Project title | Design and Implementation of an Internal Developer Platform for Self-Service Delivery and Recovery |
| Platform name | Aether IDP |
| Author | Daksh Mulundkar |
| GitHub | https://github.com/Dakshmulundkar/Internal-Developer-Platform |
| Type | Final-year engineering project |
| Current version | 1.5 |

---

## What This Project Is

A **centralized control-plane web application** for software teams. It connects to Vercel/Netlify (deployment), Grafana/Datadog/Sentry (monitoring), and GitHub (source) through plugins. It surfaces deployment health, monitoring alerts, and incidents in one dark-themed dashboard. It supports controlled rollback, AI-assisted diagnosis, per-project team management, and role-based access.

**It does NOT:**
- Host user applications
- Replace Vercel or Netlify
- Execute autonomous destructive actions
- Require a backend to work (demo mode uses seed data)

---

## Current Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 — Frontend UI Redesign | ✅ Complete | Incidents page fully rebuilt |
| Phase 1.5 — Team UX + Plugin Data | ✅ Complete | All 13 tasks done, build passes |
| Phase 2 — Backend (FastAPI) | 📋 Spec ready | Not started |
| Phase 2 — Infrastructure (K8s/ArgoCD) | 📋 Spec ready | Not started |

---

## What Was Built (Phase 1 + 1.5)

### Phase 1 — Incidents Page Redesign
Complete rewrite of `src/pages/Incidents.tsx`:
- GitGuardian-style list view with tab filters, filter chips, source badges, full table
- Split-panel detail view with breadcrumb navigation
- 4-tab detail navigation: Overview / Locations / Feedback / Activity
- Overview tab: incident KV card, terminal log viewer, related alerts
- Locations tab: perimeter stats, related deployments table
- Feedback tab: real/false-positive toggle, comment + submit
- Activity tab: merged timeline feed with icons, filter buttons
- Right sidebar: Resolve ▾ dropdown, Ignore ▾ dropdown, details KV list, AI remediation checklist
- New context action: `updateIncident(incidentId, updates)`
- New type fields on `Incident`: `ignoredReason?`, `feedbackIsReal?`, `feedbackComment?`

### Phase 1.5 — Team UX + Plugin Data
**Types (platform.ts):** `ProjectRole`, `TeamMember`, `ArgoCDAppStatus`

**Seed data (seedData.ts):**
- `mockArgoCDStatus` — synced, sha `a1b2c3d`, ns `idp-production`
- `initialTeamMembers` — 3 members on p1 (Daksh/admin, Sarah/developer, David/developer)

**Context (PlatformContext.tsx):**
- `teamMembers` state with `idp_team` localStorage persistence
- `addTeamMember`, `removeTeamMember`, `updateTeamMemberRole` actions (all log to audit)

**Dashboard.tsx:**
- Service Health widget moved to full-width section below Audit Trail + Integration Health panels
- Each stat box (Grafana/Sentry/Datadog) is now a large card with `text-2xl` value, status badge, and subtitle
- Integration Health panel restored to its original clean state (just 6 provider rows)
- ArgoCD as 6th row in Integration Health panel

**ProjectDetails.tsx:**
- 6-tab shell: Overview, Deployments, Monitoring, Errors, Infrastructure, Team
- Monitoring tab: project-scoped alerts with source badges
- Errors tab: expandable Sentry issues with stack traces, Ask AI buttons
- Infrastructure tab: ArgoCD mock KV, manual sync trigger, demo notice
- Team tab: member table, invite modal, role edit, remove

**DeploymentDetails.tsx:**
- Plugin Signals section: monitoring alerts ±30 min + Sentry release issues

**Settings.tsx:**
- Team Management card with same table + invite modal as ProjectDetails

**Role enforcement (Task 54):**
- `RollbackRecovery.tsx` — rollback disabled for viewer (with tooltip)
- `Integrations.tsx` — Configure/Remove hidden for non-admin
- `PluginConfig.tsx` — Save hidden for non-admin (amber read-only notice shown)
- `Incidents.tsx` — Resolve/Ignore hidden for viewer (role label shown)

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/types/platform.ts` | All TypeScript types and interfaces |
| `src/data/seedData.ts` | Demo seed data (945 lines) |
| `src/context/PlatformContext.tsx` | Global state, all actions, localStorage sync (1100 lines) |
| `src/pages/Incidents.tsx` | Full incident management page (main Phase 1 deliverable) |
| `src/pages/ProjectDetails.tsx` | 6-tab project hub (main Phase 1.5 frontend deliverable) |
| `src/pages/Dashboard.tsx` | Main dashboard with Service Health + ArgoCD widgets |
| `src/pages/DeploymentDetails.tsx` | Build stages, logs, AI analysis, Plugin Signals |
| `src/pages/Settings.tsx` | Provider connections + Team Management |
| `src/pages/RollbackRecovery.tsx` | Rollback workflow with role enforcement |
| `src/pages/Integrations.tsx` | Plugin marketplace with role enforcement |
| `src/pages/PluginConfig.tsx` | Per-plugin config with role enforcement |
| `.kiro/specs/incidents-redesign/` | Full spec: requirements.md, design.md, tasks.md |
| `prd.md` | Product Requirements Document |
| `architecture.md` | System + frontend + backend + infra architecture |
| `rules.md` | Agent rules — mandatory reading before any change (23 rules) |
| `phases.md` | Per-task implementation history and status |
| `memory.md` | This file — project state snapshot |

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| React Context instead of Redux/Zustand | Sufficient for demo scope; zero extra dependencies |
| Single-page navigation (no React Router) | Simpler state management; `navigateTo()` in context keeps nav state synced |
| localStorage persistence for all state | Enables full demo mode; survives page refresh |
| `?? 'admin'` default for `userProjectRole` | Ensures demo mode always shows full access (user not in teamMembers seed data) |
| Optional fields on Incident interface | Prevents breaking existing seed data when adding new Phase 1.5 fields |
| Seed data as truth for demo mode | No network requests needed; fully functional offline |
| ArgoCD GitOps for backend deployment | All infrastructure changes are auditable through Git history |
| Multi-stage Docker build | Smaller production image; builder dependencies not in runtime |
| Kustomize overlays | Single base manifest; environment differences managed declaratively |
| Supabase Vault for API keys | Provider tokens never appear in frontend state or logs |

---

## Seed Data Overview

### Projects (5)
| ID | Name | Provider | Status |
|----|------|----------|--------|
| p1 | E-Commerce Frontend | vercel | ready |
| p2 | Customer Support Portal | netlify | failed |
| p3 | Analytics Dashboard | vercel | ready |
| p4 | Auth Gateway | netlify | ready |
| p5 | Developer Documentation API | vercel | rolled_back |

### Incidents (3)
| ID | Project | Severity | Status |
|----|---------|----------|--------|
| inc101 | Customer Support Portal | critical | open |
| inc102 | Developer Documentation API | high | investigating |
| inc103 | E-Commerce Frontend | medium | resolved |

### AI Explanations Available
- `d201` — TypeScript compiler failure (98% confidence)
- `d501` — Missing DATABASE_URL env var (92% confidence)

### Team Members (on p1)
- `tm1` — Daksh Mulundkar — admin
- `tm2` — Sarah Chen — developer
- `tm3` — David Kim — developer

### Plugin Installations
- GitHub — connected
- Vercel — connected
- Netlify — error (webhook signature mismatch)
- Grafana — connected
- Sentry — syncing

---

## Environment Variables

| Variable | Used by | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | Frontend | Backend API base URL. If not set → demo mode |
| `VITE_WS_URL` | Frontend | WebSocket URL. If not set → no real-time |
| `SUPABASE_URL` | Backend | Supabase project URL |
| `SUPABASE_KEY` | Backend | Supabase service role key |
| `OPENAI_API_KEY` | Backend | OpenAI API key for AI analysis |
| `GROQ_API_KEY` | Backend | Groq API key (free tier alternative) |
| `VERCEL_WEBHOOK_SECRET` | Backend | Webhook signature validation |
| `NETLIFY_WEBHOOK_SECRET` | Backend | Webhook signature validation |
| `CORS_ORIGINS` | Backend | Comma-separated allowed origins |

---

## Commands

```bash
# Run frontend in dev mode
npm run dev

# Type-check + build
npm run build

# Run backend locally (Phase 2)
cd backend && uvicorn main:app --reload

# Build Docker image (Phase 2)
docker build -t ghcr.io/dakshmulundkar/idp-backend:latest ./backend

# Apply ArgoCD apps to cluster (Phase 2)
kubectl apply -f argocd/ -n argocd
```

---

## What's Next (Phase 2)

### Immediate next tasks (in order):
1. **Task 15** — Set up FastAPI backend project (`backend/` folder, pyproject.toml, main.py, config.py, database.py, .env.example)
2. **Task 16** — Supabase database setup (run SQL schema, enable RLS, enable Realtime)
3. **Task 17** — Real authentication backend (Supabase Auth integration)
4. **Task 18** — Real authentication frontend (`src/services/api.ts`, demo fallback)
5. Continue Tasks 19–34 for full backend, then Tasks 35–42 for infrastructure

### Constraint to remember:
- No UI changes during Phase 2
- Demo mode must always remain functional
- All tests must pass before moving to the next backend task

---

## Last Verified State

```
Date: September 5, 2026
Build: npm run build → Exit 0, 2052 modules, 0 errors
TypeScript: tsc passes with 0 errors across all modified files
Phase 1: ✅ Complete (Tasks 1–14)
Phase 1.5: ✅ Complete (Tasks 43–55)

Recent changes:
- Dashboard.tsx: Service Health widget moved out of right column to full-width section below
- rules.md: Fully rewritten as agent rules (23 rules) with mandatory pre-edit reading checklist,
  memory.md update requirement, and self-check list
```
