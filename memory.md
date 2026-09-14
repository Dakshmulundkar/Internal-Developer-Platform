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
| Current version | 2.1 |

---

## What This Project Is

A **centralized control-plane web application** for software teams. It connects to Vercel/Netlify (deployment), Grafana/Datadog/Sentry (monitoring), and GitHub (source) through plugins. It surfaces deployment health, monitoring alerts, and incidents in one dark-themed dashboard. It supports controlled rollback, AI-assisted diagnosis, per-project team management with full invite flow, role-based access, plus a real FastAPI backend with the feature scope below.

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
| Phase 2 — Backend (FastAPI) | ✅ Complete | Live backend running, routers + scheduler + websockets |
| Phase 2 — Infrastructure (K8s/ArgoCD) | ✅ Complete | Manifests in k8s/ and argocd/ directories |
| Phase 2.1 — Audit + Invite Flow | ✅ Complete | Full audit pass, team invite with email + in-platform notifications |
| Phase 3 — Multi-Tenant Isolation Audit | ✅ Complete | Report → `SECURITY_AUDIT.md`, all High + Medium fixes applied & verified |

---

## Phase 3 — Multi-Tenant Isolation Audit (2026-09-13)

Read-only audit first, then incremental fixes. Durable report: **`SECURITY_AUDIT.md`** (repo root).
Architecture: NO `teams`/workspace table — **the project is the tenant boundary**;
`team_members.project_id → projects.id` with roles viewer/developer/admin + implicit owner.

### Key facts
- Backend uses the **service-role key and bypasses RLS by design**; owner-centric RLS is
  latent defense only. Server-side handler scoping (`get_user_project_ids`) is the live boundary.
- The repo's own tracker `PROGRESS.md` (16 phases) has been updated under "Phase 8/16 update".

### Fixes applied (High)
| Fix | What |
|-----|------|
| FIX-A | `/monitoring/events`: anonymous callers rejected unless `X-Event-Intake-Secret` == `EVENT_INTAKE_TOKEN` (fail-closed) |
| FIX-B | `/upload` requires existing `comment_id` + project membership (orphan/cross-tenant uploads rejected) |
| FIX-C | `/plugins/test` SSRF guard (`_assert_safe_target`) + `follow_redirects=False` |
| FIX-D | rollback `target_deployment_id` must belong to the caller's project |
| FIX-E | `service_prober._safe_get` re-asserts safety on every redirect hop |

### Fixes applied (Medium)
| Fix | What |
|-----|------|
| FIX-F | Automation webhook action: URL must pass SSRF guard, no redirect follow |
| FIX-G | WebSocket broadcast filters `team_members.status='accepted'` |
| FIX-H | Automation rules re-check rule-owner project access at fire time |
| FIX-I | Automation `notify` target restricted to project owner/accepted members |
| FIX-J | Share passwords → PBKDF2-HMAC-SHA256 (600k iter + salt), legacy auto-upgrade |
| FIX-K | `/team/search` + invites: paginated `list_users` (1000-user cap), 30/min rate limit |
| FIX-L | Rollback polling token scoped to `installed_by = project.owner_id` |

### Deferred / residual
- Attachments bucket still public-by-default; private-bucket + signed URLs is the follow-up.
- Low items: audit `select("*")`, untyped incident body, AI-analyze rate limit, global `/monitoring/sync`.
- RLS remains service-role-bypassed by design; rework only if a Supabase client ever ships to the browser.

### Config addition
- **`EVENT_INTAKE_TOKEN`** (backend `.env`, optional) — shared secret enabling anonymous
  event intake to `/monitoring/events`; unset → anonymous rejected (fail-closed).

---

## Phase 2.1 — Master Audit Changes

### Bugs Fixed
| Bug | File(s) | Severity |
|-----|---------|----------|
| Rules of Hooks violation — `useState` inside IIFE in JSX | `Settings.tsx` | Critical |
| Duplicate `TeamMember` interface (second one dropped `status` field) | `platform.ts` | High |
| GitHub OAuth token (`gh_token`) leaked in redirect URL | `auth.py`, `Login.tsx`, `PlatformContext.tsx` | High |
| Hardcoded `http://localhost` URLs in backend auth | `auth.py`, `config.py` | High |
| `datadog` missing from `AlertSource` type | `platform.ts` | Medium |
| Stale `isApiMode` missing from `useEffect` dependency array | `PlatformContext.tsx` | Medium |
| Duplicate `localStorage.removeItem` on logout | `PlatformContext.tsx` | Low |

### Dead Code Removed
- `@tanstack/react-query-devtools` dependency (never rendered)
- `mockArgoCDStatus` import in `Dashboard.tsx`
- `initialSentryIssues` import in `Dashboard.tsx` and `ProjectDetails.tsx`
- `setAuditLogs` destructuring in `ProjectDetails.tsx`
- `import time` in `backend/routers/deployments.py`
- `import secrets` in `backend/routers/auth.py`

### Performance
- **Code splitting**: all 17 pages converted to `React.lazy()` + `Suspense`. Initial JS chunk: 970 KB → 91 KB (gzip: 241 KB → 23 KB). Pages load on demand.
- **Login flow**: `refreshData()` deferred via `setTimeout(0)` — dashboard renders before API calls start.
- **Backend deduplication**: `get_user_project_ids()` shared helper in `dependencies.py`, eliminating duplicate queries across 6 routers.
- **`githubSetup` call removed from OAuth login path** — token no longer leaked to frontend.

### New shared utility
- `src/lib/alertUtils.ts` — `alertSourceColor()` and `alertSourceLabel()` used by Dashboard, Monitoring, Incidents, DeploymentDetails, ProjectDetails (was copy-pasted across all 5).

### Security
- GitHub access token removed from OAuth redirect URL entirely
- `APP_FRONTEND_URL` / `APP_BACKEND_URL` settings added to `config.py`; all 5 hardcoded localhost URLs replaced
- `issuesApi.ts` rewrote unauthenticated `fetch()` calls to use the authenticated `api` helper

### TypeScript
- `as any` casts eliminated across all pages and components
- Sidebar `menuItems` typed against `PageType`
- `SearchModal` uses `Record<string, unknown>` cast instead of `as any`
- `Integrations.tsx` category filter cast replaced with proper type

---

## Phase 2.1 — Team Invite Flow (NEW)

### What was built
When an admin invites a member via **Settings → Team Management → Invite Member**:

1. **Backend** (`backend/routers/team.py`):
   - Generates a secure `invite_token` (32-byte `secrets.token_urlsafe`)
   - Inserts `team_members` row with `status='invited'`, `invite_token`, `invite_expires_at` (7 days)
   - Sends **invite email** via Resend (styled dark HTML + plain text fallback) with Accept / Decline links pointing to `{APP_FRONTEND_URL}/#/invite/accept?token=...`
   - If the email matches an existing Aether account → inserts a **`notifications` row** so the user sees an in-platform banner immediately without needing to check email
   - New endpoints: `POST /team/{id}/accept`, `POST /team/{id}/decline`, `GET /team/invites/pending`

2. **Database** (`backend/supabase_schema_additions.sql` — v1.7 section):
   - `ALTER TABLE team_members` adds `status`, `invite_token`, `invite_expires_at` columns (idempotent)
   - New `notifications` table with RLS (user sees only their own rows), indexes for unread count and JSON path queries

3. **Frontend**:
   - `src/services/api.ts` — `api.team.getPendingInvites()`, `acceptInvite()`, `declineInvite()`
   - `src/types/platform.ts` — `TeamMember` gains `projectName?`, `inviteToken?`, `inviteExpiresAt?`
   - `src/context/PlatformContext.tsx` — `pendingInvites` state, `refreshPendingInvites()`, updated `acceptTeamInvite` / `declineTeamInvite` to be async and call API. Fetched on login + polled every 60 s.
   - `src/components/InviteBanner.tsx` — collapsible blue banner at top of every page when pending invites exist. Per-invite Accept/Decline with spinners, error display, role badge, expiry date.
   - `src/App.tsx` — `<InviteBanner />` mounted between `<Header />` and `<main>`
   - `src/pages/Settings.tsx` — invite modal redesigned: dual-delivery info (Mail icon), sent-confirmation state (CheckCircle, auto-closes), spinner in Send button, improved role labels

### Invite delivery matrix
| Scenario | Email | In-platform banner |
|----------|-------|--------------------|
| Invited email has an Aether account | ✅ | ✅ |
| Invited email has no Aether account | ✅ | ❌ (pending until they register) |
| `RESEND_API_KEY` not set | console log | ✅ (if account exists) |

---

## Phase 2 Implemented Scope (backend + frontend)

### Backend (`backend/`)
- **FastAPI app** (`main.py`): CORS from `CORS_ORIGINS`, Supabase JWT auth via `get_current_user` (Bearer), WebSocket endpoint `/ws/{channel}`, APScheduler lifespan startup, all routers registered.
- **Auth**: Supabase Auth (`supabase.auth.get_user()`). ES256 JWT. Do not reintroduce local HS256 decode.
- **Routers**:
  - `auth.py` — login, OAuth GitHub, refresh, me. All redirect URLs use `settings.APP_FRONTEND_URL` / `APP_BACKEND_URL`.
  - `projects.py`, `deployments.py`, `incidents.py`, `monitoring.py`, `integrations.py`, `notifications.py`, `search.py`
  - `team.py` — team members CRUD + roles + **full invite flow** (email + in-platform notification + accept/decline endpoints)
  - `automation.py`, `scheduled_tasks.py`, `sharing.py`, `comments.py`, `ai.py`, `activity.py`, `webhooks.py`
- **Shared helper**: `dependencies.py` → `get_user_project_ids(user_id)` used by all 6 routers that filter by project ownership.
- **Email service**: `services/email_service.py` — Resend integration with templates for invite, incident, rollback.

### Supabase schema
- `backend/supabase_schema.sql` — base schema
- `backend/supabase_schema_additions.sql` — Phase 2 additions:
  - v1.0–1.6: comments, activities, attachments, team_members, share_links, user_preferences, automation_rules, scheduled_tasks, search indexes
  - **v1.7**: `ALTER TABLE team_members` (status/invite_token/invite_expires_at) + new `notifications` table
- ⚠️ **Must be executed** in Supabase SQL editor before new features persist end-to-end.

### Frontend (`src/`)
- **Code splitting**: all 17 pages `React.lazy()` + `Suspense`. Initial bundle: 91 KB (was 970 KB).
- **`services/api.ts`** — namespaces: `auth`, `deployments`, `incidents`, `monitoring`, `integrations`, `plugins`, `team` (incl. invite endpoints), `notifications`, `search`, `comments`, `attachments`, `automation`, `scheduledTasks`, `sharing`, `security`.
- **`context/PlatformContext.tsx`** — exports `PageType`; `pendingInvites` + `refreshPendingInvites`; async `acceptTeamInvite`/`declineTeamInvite`; `refreshData` deferred on login.
- **Components**: `InviteBanner`, `ShareDialog`, `SearchModal`, `ActivityFeed`, `CommentSection`
- **Pages**: Dashboard (widget customization), Automation (drag-reorder, Jira-style), ScheduledTasks (drag-reorder), Settings (invite modal with dual-delivery UX), all others enriched with share/comments/activities.

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI app entrypoint, lifespan scheduler, WS endpoint |
| `backend/routers/team.py` | Team CRUD + invite flow (email + notification + accept/decline) |
| `backend/services/email_service.py` | Resend email: invite, incident, rollback templates |
| `backend/dependencies.py` | `get_current_user`, `get_user_project_ids` shared helpers |
| `backend/supabase_schema_additions.sql` | All Phase 2 schema additions incl. v1.7 invite columns |
| `backend/config.py` | Settings: `APP_FRONTEND_URL`, `APP_BACKEND_URL`, email, OAuth |
| `src/services/api.ts` | API client namespaces + `isApiAvailable()` + invite endpoints |
| `src/context/PlatformContext.tsx` | Global state, pendingInvites, async invite actions, WS |
| `src/components/InviteBanner.tsx` | In-platform invite banner (Accept/Decline) |
| `src/components/ShareDialog.tsx` | Share-link dialog |
| `src/components/SearchModal.tsx` | Global Ctrl+K search overlay |
| `src/lib/alertUtils.ts` | Shared `alertSourceColor()` / `alertSourceLabel()` |
| `src/pages/Settings.tsx` | Settings page incl. improved invite modal |
| `src/pages/Automation.tsx` | Jira-like automation rules UI |
| `src/pages/ScheduledTasks.tsx` | CRON task cards UI |
| `src/types/platform.ts` | All TypeScript types (TeamMember has invite fields) |
| `src/data/seedData.ts` | Demo seed data |
| `SECURITY_AUDIT.md` | Multi-tenant isolation audit report (findings A–P + fixes) |
| `PROGRESS.md` | 16-phase audit tracker (Phase 8/16 update logged) |
| `backend/rate_limit.py` | In-process fixed-window rate limiter (auth, team search) |
| `memory.md` | This file — project state snapshot |

---

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| React Context instead of Redux/Zustand | Sufficient for demo scope; zero extra dependencies |
| Single-page navigation (no React Router) | Simpler state management; `navigateTo()` in context |
| localStorage persistence for all state | Enables full demo mode; survives page refresh |
| Supabase Auth for real auth (ES256 JWT) | WS and HTTP share one token path |
| `isApiAvailable()` gating everywhere | Demo mode stays fully functional without backend |
| APScheduler in-process (lifespan) | No extra infra; `apscheduler==3.10.4` pinned |
| Native HTML5 drag-and-drop reorder | No new dependency; `useDragReorder` shared |
| Share links via public token route | Password + expiry optional |
| Postgres FTS for search | Full-text search without extra services |
| Code splitting via `React.lazy()` | 91 KB initial bundle (was 970 KB) |
| `get_user_project_ids()` shared helper | Single point of truth for project ownership queries |
| Dual-delivery invites | Email via Resend + in-platform notification ensures invitee always gets it |
| Invite token in URL fragment only | Never in server logs or Referer headers |
| 7-day invite expiry | Balances convenience vs. security |

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

### Team Members (on p1)
- `tm1` — Daksh Mulundkar — admin
- `tm2` — Sarah Chen — developer
- `tm3` — David Kim — developer

---

## Environment Variables

| Variable | Used by | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | Frontend | Backend API base URL. If not set → demo mode |
| `VITE_WS_URL` | Frontend | WebSocket URL |
| `VITE_USE_API` | Frontend | Force API mode with dev proxy |
| `SUPABASE_URL` | Backend | Supabase project URL |
| `SUPABASE_KEY` | Backend | Supabase service role key |
| `OPENAI_API_KEY` | Backend | OpenAI API key for AI analysis |
| `GROQ_API_KEY` | Backend | Groq API key (free tier alternative) |
| `RESEND_API_KEY` | Backend | Resend email delivery (invites, incidents, rollbacks) |
| `FROM_EMAIL` | Backend | Sender address for Resend emails |
| `FROM_NAME` | Backend | Sender display name (default: "Aether IDP") |
| `APP_FRONTEND_URL` | Backend | Frontend origin for invite accept/decline links |
| `APP_BACKEND_URL` | Backend | Backend origin for GitHub OAuth callback |
| `GITHUB_CLIENT_ID` | Backend | GitHub OAuth App client ID |
| `GITHUB_CLIENT_SECRET` | Backend | GitHub OAuth App secret |
| `EVENT_INTAKE_TOKEN` | Backend | Shared secret for anonymous `/monitoring/events` intake (optional; unset = fail-closed) |
| `VERCEL_WEBHOOK_SECRET` | Backend | Webhook signature validation |
| `NETLIFY_WEBHOOK_SECRET` | Backend | Webhook signature validation |
| `CORS_ORIGINS` | Backend | Comma-separated allowed origins |

---

## Commands

```bash
# Run frontend in dev mode
npm run dev

# Type-check (must pass before finishing any task)
npx tsc --noEmit

# Run backend locally
cd backend && .\venv\Scripts\activate && uvicorn main:app --reload

# Backend Python syntax check
python -m compileall backend -q

# Production build
npm run build

# Build Docker image
docker build -t ghcr.io/dakshmulundkar/idp-backend:latest ./backend
```

---

## What's Next

1. **(Optional env)** Set `EVENT_INTAKE_TOKEN` in `backend/.env` if external test runners
   should be able to POST to `/monitoring/events` without an account (leaves it fail-closed otherwise).
2. **(Follow-up)** Attachments bucket: switch to private + signed-URL read path (FIND-B residual).
3. **(Low)** `audit select("*")` (FIND-N), untyped incident body (FIND-O), AI-analyze rate limit
   (FIND-P), `/monitoring/sync` global trigger (FIND-M)` — documented in SECURITY_AUDIT.md §26.
4. Commit the current changes (all uncommitted): isolation fixes + SECURITY_AUDIT.md + PROGRESS.md/memory.md updates.

## Constraints to remember
- No Kanban/Scrum features.
- Demo mode must always remain functional (seed data + localStorage).
- Do NOT hardcode localhost URLs — always use `settings.APP_FRONTEND_URL` / `APP_BACKEND_URL`.
- Supabase ES256 JWT: always use `supabase.auth.get_user()`, never manual HS256 decode.
- Tenancy: the **project is the tenant boundary**; every handler scopes via `get_user_project_ids`.
- SSRF: `custom_url` probes, plugin test targets, and automation webhooks must pass
  `_assert_safe_target`; do not `follow_redirects=True` on user-controlled targets.
- `/monitoring/events` anonymous intake stays fail-closed unless `EVENT_INTAKE_TOKEN` is set.
- Invite/accept visibility rules: data visibility starts on **status='accepted'** (WS + scoping).

---

## Last Verified State

```
Date: September 13, 2026
TypeScript: npx tsc --noEmit → 0 errors
Build: npm run build → ✔ built in 26.6s, frontend production bundle OK
Backend: python -m compileall backend -q → passes
App wiring: import main + TestClient GET /health → 200, route wiring OK
Guard tests: share KDF + SSRF redirect-hop checks → passed
Temp artifacts: D:\dev\temp\opencode\guard_checks.py + supabase_probe*.log removed

Isolation audit + fixes (Phase 3, all verified):
- SECURITY_AUDIT.md written (findings A–P, tenancy/RBAC/RLS matrix)
- FIX-A..E (High): monitoring events fail-closed, upload membership, plugins SSRF,
  rollback project check, prober redirect revalidation
- FIX-F..L (Medium): automation SSRF/membership/notify, WS accepted filter,
  share PBKDF2, team search pagination, poll token scoping
- Config: EVENT_INTAKE_TOKEN added (optional, fail-closed)
- No RLS, schema, or credential changes made
```
