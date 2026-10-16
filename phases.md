# Implementation Phases
# Aether IDP — Internal Developer Platform

**Version:** 1.7
**Last Updated:** October 2026

---

## Phase Overview

```
Phase 1      Phase 1.5        Phase 2 (Backend)      Phase 2 (Infra)
──────────   ─────────────   ───────────────────    ─────────────────
Tasks 1–14   Tasks 43–55     Tasks 15–34            Tasks 35–42
UI only      Plugin data     FastAPI + Supabase      Docker, K8s, ArgoCD
             + Team UX       + Real integrations
✅ Complete  ✅ Complete      ✅ Implemented         ✅ Implemented
```

```
Phase 3              Phase 4              Phase 5              Phase 6
─────────────────    ─────────────────    ─────────────────    ─────────────────
Plugin adapters      Security scanning    Free deploy          AI + honesty gaps
Batches 0–4          Trivy + OSV          Netlify + Railway    (new work items)
✅ Implemented       ✅ Implemented       ✅ Implemented       ✅ Implemented

```

```
Phase 7                          Phase 8
─────────────────────────────    ─────────────────────────────
Non-coder onboarding hardening   Repo Auto-Fix (GitHub PAT)
Tasks 61–73                      Tasks 74–84
Setup/update/doctor scripts,     Encrypted PAT, repo scan,
port+env+README fixes, CI        Dockerfile + lint auto-fix,
tests, fail-fast config          push to branch + PR
📋 Spec ready                    📋 Spec ready
```

**Why Phase 7 exists** — Live audit (Oct 2026; every claim was executed, not just read):
a fresh clone fails `docker compose up` (`backend/.env` is gitignored but required by
`env_file`), README documents port 5173 while Vite pins **5174** (`strictPort: true`),
README's uvicorn command starts on **8000** while the Vite proxy targets **8001**,
README points at the wrong `.env.example`, `pip install -e .` installs no importable
package (`include = ["backend*"]` matches nothing), `npm run backend` is Windows-only
(`venv\Scripts\`), `backend/.env.example` is missing 5 keys (`FERNET_KEY`,
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `APP_FRONTEND_URL`, `APP_BACKEND_URL`),
CI never runs vitest or backend pytest, and the CI "deploy" job is an `echo`.
Verified working in the same audit: `npm run build`, `npm test` (8/8), backend
`/health`, Vite dev + proxy, `npm run dev` (both services), CORS 5173+5174,
`docker-compose config` validity, production SPA serving via `ENVIRONMENT=production`.

**Why Phase 8 exists** — Non-coders cannot write a Dockerfile or fix lint errors.
The platform stores an encrypted GitHub classic PAT per user (Fernet, same key
infrastructure as plugin credentials), scans the user's repo, generates missing
Dockerfiles from stack detection, runs safe linter autofixers, and pushes the result
to a **new branch** with a PR — the user only clicks Apply. The PAT never touches
frontend code, is never logged, and can be revoked in one click.

---

## Phase 1 — Frontend UI Redesign

**Goal:** Rewrite the Incidents page to a professional split-panel incident management interface matching the GitGuardian-style reference design. All data from localStorage/seedData.

**Files changed:** `src/types/platform.ts`, `src/context/PlatformContext.tsx`, `src/pages/Incidents.tsx`

**Status:** ✅ Complete

---

### Task 1 — Update Incident type in `platform.ts`
**File:** `src/types/platform.ts`
**What was done:**
- Added `ignoredReason?: string` — stores reason when incident is ignored
- Added `feedbackIsReal?: boolean` — stores user's real/false-positive answer
- Added `feedbackComment?: string` — stores user's additional feedback text

---

### Task 2 — Add `updateIncident` action to `PlatformContext`
**File:** `src/context/PlatformContext.tsx`
**What was done:**
- Added `updateIncident(incidentId, updates)` to context interface
- Implemented function that patches incident in state and syncs to localStorage
- Added to Provider value object

---

### Task 3 — Add `getRemediationSteps` utility
**File:** `src/pages/Incidents.tsx`
**What was done:**
- Implemented `getRemediationSteps(deploymentId?)` function
- Parses `aiExplanations[deploymentId]?.recommendations` into step objects
- Assigns Lucide icons based on keyword matching (rollback→RefreshCw, env→Settings, etc.)
- Always appends resolve step last
- Includes 3-step generic fallback when no AI data exists

---

### Task 4 — Add `relativeTime` and `openedFor` helpers
**File:** `src/pages/Incidents.tsx`
**What was done:**
- `relativeTime(ts)` — "just now" / "X minutes ago" / "about X hours ago" / "X days ago"
- `openedFor(ts)` — "Less than 1 hour" / "X hours" / "X days" (no "ago")

---

### Task 5 — Rewrite Incidents.tsx — State + List View
**File:** `src/pages/Incidents.tsx`
**What was done:**
- Replaced `statusFilter` with `listTab` (all/open/critical/investigating/resolved)
- Replaced `localActiveId` with `selectedId`, initialized from `activeIncidentId`
- Added `activeTab`, `resolveOpen`, `ignoreOpen`, `resolveRef`, `ignoreRef`
- Added `feedbackIsReal`, `feedbackComment`, `feedbackSubmitted`, `activityFilter`, `commentText`
- Implemented filter logic with `matchSearch` + `matchTab`
- Built tab bar with Critical red dot indicator
- Built filter chips row with dismissible chips
- Built full-width incident table with 7 columns

---

### Task 6 — Build Incident Detail — Shell + Tabs
**File:** `src/pages/Incidents.tsx`
**What was done:**
- Top bar with back button + breadcrumb (Incidents / title truncated at 50 chars)
- Title row with provider badge
- 4-tab bar: Overview | Locations | Feedback | Activity
- Split layout: left panel (flex-1) + right sidebar (w-80 sticky)

---

### Task 7 — Overview Tab
**What was done:**
- Incident Details KV card with all field mappings
- Deployment logs terminal with line numbers and color-coded lines
- "Inspect Full Logs" and "Initiate Rollback" buttons below terminal
- Related Alerts section (conditional on incidentId match)

---

### Task 8 — Locations Tab
**What was done:**
- Impacted Perimeter: 3 stat boxes (Failed Deployments, Occurrences, Open Incidents)
- Related Deployments table with 5 columns (Date, Author, Commit, Stage Failed, Status)
- Row click navigates to deployment details
- Empty state for no deployments

---

### Task 9 — Feedback Tab
**What was done:**
- "Is this a real incident?" toggle with Yes / False Positive buttons
- Comment textarea with placeholder
- Submit calls `addComment` + `updateIncident` + sets `feedbackSubmitted`
- Inline success confirmation message

---

### Task 10 — Activity Tab
**What was done:**
- Filter buttons: All | Actions | Comments
- Comment input + Submit
- Merged timeline feed sorted ascending
- Per-type icons and colors
- Connector line between items

---

### Task 11 — Right Sidebar — Status, Resolve, Ignore
**What was done:**
- Large status badge
- Resolve dropdown with 3 options, calls `resolveIncident` + returns to list
- Ignore dropdown with 4 options, calls `updateIncident` with ignoredReason
- `useRef` click-outside handler for both dropdowns

---

### Task 12 — Right Sidebar — Details KV List
**What was done:**
- 8 KV rows: Assignee, Occurred, Detected, Opened for, Severity, Provider, Tags, Developer
- Severity and status values rendered as badge components
- Tags row with derived tag pills

---

### Task 13 — Right Sidebar — How to Remediate
**What was done:**
- `getRemediationSteps(incident.deploymentId)` called from Task 3
- Each step: icon + title + description
- Last step (isResolveLink): `text-blue-400 hover:underline`, clicking calls `resolveIncident`

---

### Task 14 — Verify Phase 1 Interactions
**Status:** Verified ✅
- List tabs filter correctly
- Filter chips appear and are dismissible
- Row click opens detail view
- Back button returns to list
- All 4 tabs switch without losing sidebar state
- Both dropdowns close on outside click
- Resolve marks incident resolved and returns to list
- Ignore marks incident resolved with reason
- Activity tab adds comment
- Feedback tab records feedback
- Remediation resolve link works
- Cross-page navigation via `activeIncidentId` works
- Dashboard incident count updates

---

## Phase 1.5 — Single-Project Team UX + Plugin Data Display

**Goal:** Surface plugin data (Grafana, Datadog, Sentry, ArgoCD) in the right pages and add per-project team management. All data from existing seed data and new mock seed entries. No backend required.

**Files changed:** `platform.ts`, `seedData.ts`, `PlatformContext.tsx`, `Dashboard.tsx`, `ProjectDetails.tsx`, `DeploymentDetails.tsx`, `Settings.tsx`, `RollbackRecovery.tsx`, `Integrations.tsx`, `PluginConfig.tsx`, `Incidents.tsx`

**Status:** ✅ Complete

---

### Task 43 — Add new types to `platform.ts`
**Status:** ✅ Already implemented
- `ProjectRole` type: `'viewer' | 'developer' | 'admin'`
- `TeamMember` interface with full field set
- `ArgoCDAppStatus` interface with sync/health/image fields

---

### Task 44 — Add seed data for TeamMembers and ArgoCD status
**Status:** ✅ Already implemented
- `mockArgoCDStatus` — Synced, sha `a1b2c3d`, namespace `idp-production`
- `initialTeamMembers` — 3 members on project `p1` (Daksh/admin, Sarah Chen/developer, David Kim/developer)

---

### Task 45 — Add TeamMember state + actions to `PlatformContext`
**Status:** ✅ Already implemented
- `teamMembers` state (persists to `idp_team` localStorage key)
- `addTeamMember` — generates ID + timestamp, appends audit log
- `removeTeamMember` — filters out member, appends audit log
- `updateTeamMemberRole` — patches role, appends audit log

---

### Task 46 — Dashboard — Service Health Widget + ArgoCD row
**Status:** ✅ Implemented
- Service Health widget: 3 mini-stat boxes (Grafana latest value, Sentry unresolved count, Datadog firing count)
- All 3 boxes clickable → navigateTo('monitoring')
- ArgoCD added as 6th row in Integration Health panel

---

### Task 47 — ProjectDetails — 6-Tab Navigation Shell
**Status:** ✅ Implemented
- `activeTab` state with 6 values
- Tab bar with icons (Server, History, Activity, Bug, GitMerge, Users)
- Existing content wrapped in Overview and Deployments conditionals
- `monitoringAlerts`, `teamMembers`, team actions destructured from context

---

### Task 48 — ProjectDetails — Monitoring Tab
**Status:** ✅ Implemented
- Filters alerts by `projectId`
- Alert list with source badge, severity pill, title, value, relative time
- Firing count badge + "View all →" link
- Empty state with plugin install prompt

---

### Task 49 — ProjectDetails — Errors Tab
**Status:** ✅ Implemented
- `initialSentryIssues` filtered by `projectId`
- Expandable rows with stack trace, first/last seen, release, environment
- Level pills: fatal/error/warning/info with correct colors
- "Ask AI" navigates to AI assistant with context
- Count badge in header + "Ask AI about all" button

---

### Task 50 — ProjectDetails — Infrastructure Tab
**Status:** ✅ Implemented
- ArgoCD KV table: App Name, Sync Status, Health, Image Tag, Last Synced, Namespace, Target Revision
- Sync status badge (emerald/amber/red based on syncStatus)
- "Trigger Manual Sync" button with inline success toast (5s)
- "View Rollback History" → navigateTo('rollback-recovery')
- Amber demo notice banner

---

### Task 51 — ProjectDetails — Team Tab
**Status:** ✅ Implemented
- Members table with initials avatar, name, email, role badge, addedAt, actions
- Role badges: admin=white/black, developer=blue, viewer=zinc
- Role edit dropdown (admin only, own row excluded)
- Remove with `window.confirm` (admin only)
- Invite modal: email + role select + "Send Invite" → `addTeamMember`
- Role capabilities footnote

---

### Task 52 — DeploymentDetails — Plugin Signals Section
**Status:** ✅ Implemented
- "Plugin Signals Near This Deployment" card below terminal logs
- Sub-section 1: Monitoring Alerts (±30 min) with delta labels (`+5m after`)
- Sub-section 2: Sentry Issues in This Release filtered by `release === version || deploymentId === id`
- Empty states for each sub-section
- "Ask AI" button on each Sentry issue row

---

### Task 53 — Settings — Team Management Section
**Status:** ✅ Implemented
- Team Management card after User Profile
- Same member table pattern as ProjectDetails Team tab
- "Invite Developer" button (admin only) opens inline invite modal
- Role edit select + remove button per row (excluding own row)

---

### Task 54 — Role-based UI enforcement
**Status:** ✅ Implemented across all 4 files

| File | Enforcement |
|------|-------------|
| `RollbackRecovery.tsx` | Rollback button disabled + `title` tooltip for viewer role |
| `Integrations.tsx` | Configure + Remove buttons hidden for non-admins; "view only" label shown |
| `PluginConfig.tsx` | Save button hidden for non-admins; amber read-only notice shown |
| `Incidents.tsx` | Resolve + Ignore dropdowns hidden for viewers; viewer role label shown |

Standard pattern used in all 4 files:
```ts
const userProjectRole = teamMembers.find(
  tm => tm.projectId === (activeProjectId || projects[0]?.id) && tm.userId === user?.id
)?.role ?? 'admin'
```

---

### Task 55 — Verify Phase 1.5 Interactions
**Status:** ✅ Verified

- ✅ Dashboard Service Health widget shows 3 plugin stat boxes
- ✅ Dashboard Integration Health shows ArgoCD as 6th row
- ✅ ProjectDetails has 6 tabs, all switch correctly
- ✅ Monitoring tab shows alerts filtered to project
- ✅ Errors tab shows Sentry issues with expand/collapse and Ask AI
- ✅ Infrastructure tab shows ArgoCD mock KV data
- ✅ "Trigger Manual Sync" shows inline success toast
- ✅ Team tab shows members with correct role badges
- ✅ Admin can invite, edit role, and remove members
- ✅ Non-admin cannot see Invite/Edit/Remove
- ✅ DeploymentDetails shows Plugin Signals section with both sub-sections
- ✅ Settings shows Team Management section
- ✅ Rollback button disabled for viewer role
- ✅ Integrations Configure/Remove hidden for non-admin
- ✅ PluginConfig Save hidden for non-admin
- ✅ Incidents Resolve/Ignore hidden for viewer
- ✅ Zero TypeScript errors across all changed files
- ✅ `npm run build` exits 0 (2052 modules, no errors)

---

## Phase 2 — Real Backend Integration

**Goal:** Replace all localStorage/seedData mock behavior with a real FastAPI + Supabase backend.

**Status:** ✅ Implemented — all routers exist and are wired (`auth`, `projects`, `deployments`, `incidents`, `rollback`, `monitoring`, `plugins`, `notifications`, `audit`, `ai`, `team`, `comments`, `settings`, `search`, `scheduled-tasks`, `security`, `sharing`, `automation`, `activities`, `upload` + webhooks for vercel/netlify/grafana/github-security). Demo fallback retained when `VITE_API_URL` is unset.

**Rule:** Phase 2 must not begin until Phase 1 + Phase 1.5 are fully verified. No UI changes are permitted during Phase 2 implementation.

---

### Backend Tasks (Tasks 15–34)

| Task | Description |
|------|-------------|
| 15 | Set up FastAPI backend project (pyproject.toml, main.py, config.py, database.py, .env.example) |
| 16 | Supabase database setup (all CREATE TABLE statements, RLS policies, Realtime, Vault) |
| 17 | Real authentication — backend (register, login, logout, me, JWT verification) |
| 18 | Real authentication — frontend (api.ts service, JWT in localStorage, demo fallback) |
| 19 | Real project CRUD — backend (GET/POST/PATCH/DELETE /projects) |
| 20 | Real project CRUD — frontend (fetch on load, API calls in createProject) |
| 21 | Real Vercel webhook receiver (HMAC-SHA1 validation, event parsing, idempotency) |
| 22 | Real Netlify webhook receiver |
| 23 | Real deployment data fetching (Vercel API v6, Netlify API v1, upsert to Supabase) |
| 24 | Real incident persistence — backend (CRUD + resolve + ignore + comments + feedback) |
| 25 | Real incident persistence — frontend (API calls replacing context mutations) |
| 26 | Real rollback execution — backend (provider API call, status polling, notification) |
| 27 | Real rollback execution — frontend (POST /rollback, poll status every 3s) |
| 28 | Real AI analysis — backend (LLM prompt, structured JSON output, caching in Supabase) |
| 29 | Real AI analysis — frontend (POST /ai/analyze, loading state, fallback to seed data) |
| 30 | Real plugin data sync — backend (background jobs for Grafana, Sentry, Datadog, 5-minute interval) |
| 31 | Real plugin data sync — frontend (fetch from /monitoring/alerts on Monitoring page load) |
| 32 | Real-time WebSocket connection (backend /ws/{userId}, frontend reconnect with backoff) |
| 33 | Real notification persistence (Supabase table, WebSocket push, mark read) |
| 34 | Real audit log persistence (audit_service.log(), GET /audit for dashboard) |

---

### Infrastructure Tasks (Tasks 35–42)

| Task | Description |
|------|-------------|
| 35 | Containerize backend with Docker (multi-stage build, /health endpoint) |
| 36 | Create Kubernetes manifests — base (deployment, service, configmap, ingress, hpa) |
| 37 | Create Kubernetes overlays — dev / staging / production (Kustomize) |
| 38 | Create ArgoCD Application manifests (dev=manual, staging+prod=automated) |
| 39 | Create GitHub Actions CI/CD pipeline (build-push.yml — build, tag with SHA, push to GHCR, update manifest, commit) |
| 40 | Create Kubernetes Secrets for sensitive config (manual per namespace, secrets.example.txt) |
| 41 | Deploy ArgoCD to cluster and register all 3 applications |
| 42 | Frontend deployment (VITE_API_URL + VITE_WS_URL in hosting dashboard) |

---

## Phase 3 — Plugin Adapter System (Batches 0–4)

**Goal:** Every catalog plugin gets a real backend — install + API key must actually fetch and work. No fake-success paths.

**Status:** ✅ Implemented — `backend/services/plugins/` (`base.py` contract, `registry.py` dispatch with legacy-ID normalization, per-vendor adapters). `/plugins/test` and `plugin_sync` dispatch through it. Fernet-encrypted key storage (`FERNET_KEY`). Fixture suites: 117 pytest tests, no live keys.

- Batch 0: framework + Sentry/Datadog/New Relic completion (real tests, config fields, sync).
- Batch 1: 13 REST plugins — alert fetchers (UptimeRobot, Rollbar, Bugsnag, PagerDuty, OpsGenie), deploy fetchers (CircleCI, Render, Railway), verified tests (GitLab, Bitbucket, Jira, Linear, Discord).
- Batch 2: 8 monitoring-depth plugins (Prometheus, Elastic, Dynatrace, Honeycomb, Statuspage, Splunk On-Call, SonarQube, Snyk) + Netlify real test.
- Batch 3a: 10 CI/source plugins (Jenkins, TravisCI, TeamCity, Azure Repos, Azure Pipelines, Heroku, Terraform, ArgoCD, Raygun, Airbrake).
- Batch 3b: hard auth — AWS SigV4 (CodeDeploy, CloudWatch), GCP service-account JWT, kubeconfig parsing, Slack/Microsoft OAuth routes + Connect buttons.
- Batch 4: outbound delivery — `send()` on Slack/Discord/Teams/Jira/Linear, `POST /plugins/{id}/notify`, automatic incident fan-out (project-scoped, best-effort), Send-test button.

---

## Phase 4 — Security Scanning (Trivy + OSV)

**Goal:** IDP-side vulnerability detection without a Docker daemon, plus free static dependency audit.

**Status:** ✅ Implemented
- `backend/services/trivy_service.py` — repo-tarball and image-ref scans, HIGH/CRITICAL gate, finding cap, open-incident dedupe, honest missing-binary/missing-repo outcomes.
- Findings reuse `create_from_security_triage` unchanged.
- `security_rescan` scheduler task type + `POST /security/scan/{project_id}` (project-RBAC gated).
- OSV.dev manifest audit (npm/PyPI/Maven/Go/RubyGems) merged into project scans — pure HTTPS, no installs.

---

## Phase 5 — Free Deploy Compatibility (Netlify + Railway)

**Goal:** Everything working locally must also work with the frontend on Netlify and the backend on Railway free tiers.

**Status:** ✅ Implemented
- `backend/Dockerfile`: pinned Trivy static binary, `$PORT`-respecting start, longer healthcheck grace for cold DB download.
- `netlify.toml`: build config, SPA fallback, immutable asset caching (`VITE_API_URL` set in Netlify UI).
- Explicitly deferred as opt-in: Playwright browser checks (feasible, too heavy for free-tier always-on). Rejected: `tsc`/ESLint scanning (needs user `node_modules`).

---

## Phase 6 — AI + Honesty Gaps

**Status:** Tasks 56–60 all implemented.

### Task 56 — Real rollback execution end-to-end ✅ Implemented
- No token → `RollbackError` (HTTP 400), never sim mode; provider API errors fail
  the operation instead of proceeding; one active rollback per project (409-style
  conflict message); poll timeout marks `failed`, never assumed success.
- Stored keys decrypted (Fernet) before use; canonical + legacy plugin IDs matched.
- Fixture tests: no-token fail-closed, idempotency conflict, API-error creates no row.

### Task 57 — AI chat with context and memory ✅ Implemented
- `ai_chat_messages` table (schema migration included; missing table = memory off,
  chat still works); last 10 turns (1000 chars each) threaded into prompts;
  turns persisted per question; `GET /ai/chat/{incident_id}` preloads the UI.

### Task 58 — AI-generated incident remediation ✅ Implemented
- `POST /incidents/{incident_id}/remediation`: cached per incident, generated from
  live error/failed-stage/provider/logs, labeled GENERIC only on backend failure.
  Sidebar shows an AI-GENERATED badge; static list remains the offline fallback.

### Task 56 — Real rollback execution end-to-end
**Gap:** `backend/services/rollback_service.py:115,247` — no provider token proceeds in simulated mode; status polling falls back to success on timeout. A rollback can report success without anything happening.
**Do:** require a real provider token (fail closed with a clear error), poll actual provider state until terminal, remove the timeout-success path. Verify with a fixture test that asserts failure when no token exists.

### Task 57 — AI chat with context and memory
**Gap:** `backend/services/ai_service.py::analyze_incident` is single-shot — JSON context in, answer out. No conversation is persisted (no history table is written), so follow-up questions start from zero every time.
**Do:** persist per-incident/per-project chat turns (new `ai_chat_messages` table or `ai_analyses` extension), feed the last N turns into the prompt, cap context length. Frontend keeps ephemeral state only — no frontend change needed beyond what exists.

### Task 58 — AI-generated incident remediation steps
**Gap:** `src/pages/Incidents.tsx::getRemediationSteps` parses canned `aiExplanations[deploymentId]` seed text with keyword→icon regexes. Steps are static fixtures, not generated for the incident at hand.
**Do:** generate steps per incident from the backend (`analyze_incident` output or a dedicated `/incidents/{id}/remediation` endpoint) using live fields — error message, failed stage, provider, recent logs. Cache per incident; fall back to the current 3-step generic list only when the backend is unreachable, labeled as generic.

### Task 59 — Sentry Issues tab ✅ Implemented
- `GET /monitoring/sentry/issues`: per connected Sentry install, per-project
  `fetch_issue_details` (count, culprit, level, release, first/last seen).
  Per-project isolation — one bad token never blanks the tab.
- UI fetches live on mount with spinner; existing empty state covers no-plugin
  and failure cases; invalid enums coerced.

### Task 60 — Remaining honesty items ✅ Done where applicable
- Catalog audit re-ran: all 45 definitions resolve to real adapters — no "coming soon" badges needed.
- Fernet rotation: `FERNET_PREVIOUS_KEY` decrypt support + procedure documented in code; `FERNET_PREVIOUS_KEY` added to config.
- Per-plugin sync intervals in `plugin_sync` (chatty 60–120s, default 300s, skip-if-fresh via `last_sync_at`).
- Auth-method labels extended to `basic_auth`/`webhook` in Plugin Config.

---

## Phase 7 — Non-Coder Onboarding Hardening

**Goal:** A person with zero coding knowledge can, from a fresh clone: install and
run the whole platform with **one command**, understand what to do next from the
README alone, and update with **one command**. Every command in the docs must be
live-verified.

**Status:** 📋 Spec ready (this revision)

**Audit basis:** Full live audit, Oct 2026. Verified working already: `npm run
build` (tsc 0 errors), `npm test` (8/8), backend boot + `/health`, Vite dev on 5174,
dev proxy → backend 8001, `npm run dev` (concurrently, both services), CORS for
5173+5174, `docker-compose config` valid, production SPA serve with
`ENVIRONMENT=production` + `dist/`. Confirmed broken: items in Tasks 61–73 below.

**Canonical ports (decision, do not re-litigate):**
- Dev (npm run dev): frontend **5174** (Vite, strictPort), backend **8001** (uvicorn)
- Docker: frontend **5173** (nginx→80), backend **8000** (container-internal)
- CORS default must allow both `http://localhost:5173` and `http://localhost:5174`

---

### Task 61 — One-command setup script
**Files:** Create: `scripts/setup.ps1`, `scripts/setup.sh`; Modify: `package.json`
**Do:**
- `npm run setup` → runs the platform script. Steps in order, each with plain-language
  output ("✅ Node found (v20.11)") and stop-with-explanation on failure:
  1. Check Node ≥ 18, npm present.
  2. If `backend/.env` missing → copy `backend/.env.example` → `backend/.env` and print
     "Open backend/.env and fill the REQUIRED keys (Supabase)."
  3. If root `.env` missing → copy `.env.example` → `.env`.
  4. `npm ci`.
  5. Create `backend/venv` if missing; `venv\Scripts\pip` or `venv/bin/pip` install `-U pip`.
  6. `pip install -U -e ./backend[dev]` (deps only — see Task 67).
  7. Print next steps: fill env → run Supabase SQL files → `npm run dev` → open
     http://localhost:5174.
**Acceptance:** On a clean machine with Node only: `npm run setup` leaves the repo
ready so that filling env + `npm run dev` works. Missing Docker is a warning, not a
failure (dev mode doesn't need it).

### Task 62 — One-command update script
**Files:** Create: `scripts/update.ps1`, `scripts/update.sh`; Modify: `package.json`
**Do:**
- `npm run update` → `git pull --ff-only`; if Docker daemon reachable:
  `docker-compose build && docker-compose up -d`, then poll backend `/health` (120s
  budget) and print result; else re-run `npm ci` + `pip install -U -e ./backend[dev]`
  and print "restart `npm run dev`".
- Windows must try `docker compose` first, fall back to `docker-compose` (this
  machine has only the standalone binary — verified).
**Acceptance:** Running `npm run update` twice in a row is safe (idempotent); prints
a clear final status line (UPDATED-HEALTHY / UPDATED-HEALTH-DEGRADED / FAILED).

### Task 63 — docker-compose works on fresh clone
**Files:** Modify: `docker-compose.yml`
**Do:**
- `env_file:` entry → `path: ./backend/.env` + `required: false` (Compose spec ≥2.24;
  standalone v5.4 supports it — verify with `docker-compose config`).
- Backend already defaults `SUPABASE_URL=""`; with Task 68's degraded-health
  behavior the stack still boots and `/health` reports what's missing.
**Acceptance:** Delete `backend/.env`, run `docker-compose config` → exit 0; stack
starts and `/health` returns a JSON that names the missing variables.

### Task 64 — Port + CORS canonicalization
**Files:** Modify: `.env.example`, `backend/.env.example` (`CORS_ORIGINS`), `README.md`
**Do:**
- `CORS_ORIGINS=http://localhost:5173,http://localhost:5174` in both example files.
- `.env.example` root: document `VITE_USE_API`, `VITE_WS_URL=ws://localhost:8001`,
  comment that 5174 is the dev URL.
- No code changes — `backend/.env` on the author machine already allows both
  (verified live); this task makes the *defaults* match reality.
**Acceptance:** Grep for `localhost:5173` outside docs/docker contexts returns only
intentional docker references; no doc claims the dev URL is 5173.

### Task 65 — README rewrite of Getting Started (§6–§7)
**Files:** Modify: `README.md`
**Do:**
- §6 becomes **Quick Start (3 commands)**: `npm install` → `npm run setup` →
  `npm run dev`, open http://localhost:5174 (demo mode works with zero config).
- §7 becomes **Full stack with Docker (recommended non-k8s path)**:
  fill `backend/.env` → run Supabase SQL files → `docker-compose up --build` →
  http://localhost:5173. This path is currently undocumented — it is the easiest
  one and goes first. k8s/ArgoCD stays but moves to an "Advanced" subsection.
- Fix the local-backend command: `uvicorn main:app --reload --port 8001` (8000 broke
  the Vite proxy — verified).
- Fix env instruction: "copy `backend/.env.example`" (not root `.env.example`).
- Add **How to update**: `npm run update`.
- Add **Troubleshooting** table: port already in use (5174/8001/5173), Docker
  daemon not running, "why am I seeing demo data", CORS errors, Supabase SQL not run.
**Acceptance:** Every command block in §6–§7 is copy-pasted and executed verbatim
during Task 73 and works.

### Task 66 — Complete `backend/.env.example`
**Files:** Modify: `backend/.env.example`
**Do:**
- Add missing keys with comments (all verified present in a working `.env` but
  absent from the example): `FERNET_KEY` (with the one-liner generation command
  already in `config.py:69`), `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`,
  `APP_FRONTEND_URL`, `APP_BACKEND_URL`, `RESEND_API_KEY`, `FROM_EMAIL`, `FROM_NAME`.
- Section headers must mark `# REQUIRED` (Supabase, FERNET_KEY) vs
  `# OPTIONAL — feature degrades gracefully without these` (all plugin/AI/email keys).
**Acceptance:** Every key read by `backend/config.py` appears in the example file.

### Task 67 — Cross-platform backend launcher
**Files:** Create: `scripts/backend-dev.mjs`; Modify: `package.json`
**Do:**
- Node script: resolve python at `backend/venv/Scripts/python.exe` or
  `backend/venv/bin/python` (first that exists), spawn
  `python -m uvicorn main:app --reload --port 8001` with `cwd=backend`; exit with
  plain-language error if venv missing ("run `npm run setup` first").
- `"backend": "node scripts/backend-dev.mjs"` — removes the Windows-only
  `venv\Scripts\uvicorn` path.
**Acceptance:** `npm run dev` works on Windows; script logic is platform-agnostic
(path join via `path.join`, no hardcoded separators).

### Task 68 — Honest health + degraded config reporting
**Files:** Modify: `backend/main.py` (`/health`), `backend/config.py`
**Do:**
- At startup, collect `config_warnings: list[str]` — e.g. "SUPABASE_URL is empty:
  login and data features will fail" — without crashing (frontend-only demo users
  must still boot the backend).
- `/health` returns `{"status":"ok"|"degraded","config_warnings":[...]}`.
- Docker healthcheck stays green on `ok`; compose docs explain `degraded`.
- Do **not** add a hard crash — soft fail-fast with loud warnings (Ponytail: a
  crash would break the no-config demo path we advertise).
**Acceptance:** With empty Supabase vars, `/health` = degraded + names the vars;
  with full env, `status:"ok"` and empty warnings (live-verified both ways).

### Task 69 — `npm run doctor` diagnostic
**Files:** Create: `scripts/doctor.mjs`; Modify: `package.json`
**Do:**
- Checks, each → PASS/FAIL + one-line fix: Node ≥ 18; ports 5174/8001/5173 state;
  `backend/.env` exists; required keys non-empty; venv exists; `GET /health`
  reachable (report ok/degraded + warnings); `git` available.
- Exit code 0 iff no FAIL. No dependencies added (uses `node:net`, `fetch`).
**Acceptance:** With backend running healthy → doctor exits 0. Kill backend →
FAIL line "Backend not reachable — start it with `npm run dev`" + exit 1.

### Task 70 — CI runs the real test suites
**Files:** Modify: `.github/workflows/ci.yml`
**Do:**
- Add `npm test` (vitest) to the frontend job.
- Backend job: `pip install -e "./backend[dev]"` then `pytest backend/tests -q`
  (suite exists and passes locally — plugin adapters, 117 tests).
- Replace the fake `deploy` job (currently `echo`) with either removal or an
  honest `workflow_dispatch` notice; no job may be named Deploy while doing nothing.
**Acceptance:** CI green on a PR; a deliberately broken test fails CI (verify by PR).

### Task 71 — Honest packaging story
**Files:** Modify: `README.md`, `.github/workflows/ci.yml`, `backend/pyproject.toml` (comment only)
**Do:**
- Live-verified fact: `pip install -e .` installs deps but **no importable package**
  (`ModuleNotFoundError: No module named 'main'` from repo root; `include =
  ["backend*"]` matches nothing). Stop documenting editable installs as if they
  install the app.
- Canonical instruction everywhere: install deps with `pip install -U -e "./backend[dev]"`,
  run from `backend/` (`cd backend && python -m uvicorn main:app --reload --port 8001`).
- One-line comment in pyproject explaining flat layout + why.
**Acceptance:** No README/CI text claims the backend is importable outside `backend/`.

### Task 72 — Demo-mode banner (frontend honesty)
**Files:** Create: `src/components/DemoModeBanner.tsx`; Modify: `src/App.tsx`
**Do:**
- When `!isApiAvailable()` (i.e. `VITE_USE_API` and `VITE_API_URL` both unset):
  persistent dismissible top banner — "Demo mode: you're viewing sample data.
  Connect a backend — see Quick Start in the README."
- When API was available and `/health` fails at load: amber variant — "Backend
  unreachable — check `npm run doctor`."
**Acceptance:** Fresh clone (`npm run dev` without backend) shows the banner; with
  healthy backend it never appears; build passes.

### Task 73 — Fresh-clone end-to-end verification
**Files:** none (verification run; record results in this file under the task)
**Do:**
- Simulate a new user: export a clean copy (`git archive` to temp dir), follow
  README §6 verbatim → demo mode at 5174; fill env → §7 docker path (or dev path
  if daemon unavailable) → login page talks to real backend (`/health` ok).
- Run `npm run update` and `npm run doctor` once each.
- Every README command is executed literally; paste outcomes here.
**Acceptance:** Zero undocumented manual steps. Any failure loops back to the
responsible task before this phase is marked complete.

**Verification record (2026-10-15, D:\BDA-InstaPulse\data\tmp\opencode\aether-fresh):**
- Copy simulated via `robocopy` (fresh dir, no node_modules/venv/.git) + minimal
  git remote so `git pull --ff-only` behaves like a real clone.
- `npm install` → exit 0 (216 pkgs). `npm run setup` → **exit 0**: npm ci ✓,
  fresh venv creation ✓, pip self-upgrade ✓, 68 backend deps ✓, env copies ✓.
- §6 demo: `npm run dev` → Vite 5174 HTTP 200 ✓, uvicorn 8001 ✓, demo banner
  wired (Task 72). §7b: `VITE_USE_API=true`, `POST /auth/login` via 5174 proxy →
  401 (real API response, chain works) ✓.
- `npm run doctor` → 7/7 PASS in dev mode (8001) **and** compose mode (8000
  fallback) ✓.
- `npm run update` → first run exposed two real bugs (below), second run
  **UPDATED-HEALTHY**: images built, `up -d` healthy, `/health` ok ✓.
- §7 compose: `docker-compose up --build` → frontend 5173 HTTP 200 ✓,
  `5173/health` via nginx → `{"status":"ok","config_warnings":[]}` ✓,
  `8000/health` direct ✓. Torn down after verification.
- **Fixes that looped back:** (a) `setup.ps1`/`update.ps1` used `pip.exe`
  shims — pip 26 refuses self-upgrade that way; switched to `python -m pip`.
  (b) `backend/Dockerfile` pinned Trivy 0.66.0 whose release asset is now a
  404 (broke every compose build) — bumped to 0.76.0 (asset verified 200).
  (c) `doctor.mjs` probed 127.0.0.1 only (missed Vite's ::1 bind) and hardcoded
  backend 8001 (missed compose's 8000) — now dual-stack probe + 8001→8000
  fallback.
- Known ceilings (accepted): fixed `container_name: idp-backend/-frontend`
  blocks a second compose project on the same machine (single-project tool);
  orphaned uvicorn `--reload` children can squat :8001 after a hard kill
  (kill the python child or reboot).

---

## Phase 8 — Repo Auto-Fix (GitHub Classic PAT)

**Goal:** A non-coder connects their GitHub account with a classic PAT; the
platform scans their repo, and with one click: generates a missing Dockerfile,
auto-fixes safe lint errors, pushes everything to a **new branch**, and opens a PR.
No code leaves GitHub except the fix commit; the token is encrypted at rest and
revocable in one click.

**Status:** 📋 Spec ready (this revision)

**Threat model / constraints (global — every task inherits these):**
- Token: classic PAT, stored Fernet-encrypted (reuse plugin-key crypto; `FERNET_KEY`
  from config). Never logged, never returned by any API (only `last4` + scopes),
  never sent to the frontend after save (write-only endpoint).
- Pushes go ONLY to new branches named `aether/autofix-YYYYMMDD-HHMMSS-HASH` —
  the default branch is never pushed to (enforced in code, not by convention).
- Linters run in a temp clone via subprocess: `shell=False`, stripped environment,
  hard timeouts (npm 300s, ruff 60s), no network during ruff; `npm ci` allowed
  (needs network) but only when `package.json` lockfile exists.
- Honest limits documented in UI: repos > 200 MB, or without lockfiles, are
  scan-only (findings listed, Apply disabled with explanation).
- Every apply writes an `autofix_runs` row + audit log entry (actor, repo, branch,
  findings, PR URL).

### Task 74 — Database schema
**Files:** Create: `backend/autofix_schema.sql`; Modify: README (SQL run list)
**Do:**
- `user_github_tokens`: `id uuid pk`, `user_id uuid unique not null`,
  `encrypted_token text not null`, `token_last4 text not null`, `scopes text`,
  `github_login text`, `created_at timestamptz default now()`.
- `autofix_runs`: `id uuid pk`, `user_id uuid`, `project_id text`, `repo full_name text`,
  `branch text`, `pr_url text`, `findings jsonb`, `status text`
  (`scanning|fixing|pushed|pr_opened|failed`), `error text`, `created_at`.
- RLS: user_id = auth.uid() select/update/delete own rows only (match existing
  schema conventions in `supabase_schema_additions.sql`).
**Acceptance:** SQL applies cleanly in Supabase SQL editor; second apply is a no-op
  (`if not exists`).

### Task 75 — Token endpoints (save / status / delete)
**Files:** Create: `backend/routers/github_token.py`; Modify: `backend/main.py` (include router)
**Do:**
- `POST /settings/github/token` body `{token}` → validate via GitHub `GET /user`
  (+ `X-OAuth-Scopes`) using the token itself; encrypt (Fernet), upsert by user_id;
  return `{github_login, last4, scopes}`.
- `GET /settings/github/token/status` → connected?, login, last4, scopes, created_at.
- `DELETE /settings/github/token` → delete row.
- 401 from GitHub → 400 "GitHub rejected this token — create a classic PAT with
  the `repo` scope at github.com/settings/tokens."
- Logging redaction: a module-level `redact()` applied to any exception text
  before logging (assert in test: token substring never appears in log output).
**Acceptance:** pytest with mocked GitHub: save→status→delete roundtrip; rejected
  token → friendly 400; logs contain no token material.

### Task 76 — Repo access service (clone / cleanup)
**Files:** Create: `backend/services/autofix/repo_service.py`
**Do:**
- `clone_repo(full_name, token, dest)` — shallow clone
  (`--depth 1`) of `https://x-access-token:{token}@github.com/{full_name}.git`
  via subprocess; validate `full_name` matches `^[\w.-]+/[\w.-]+$` (no URLs,
  no `..`); timeout 120s; raise typed `RepoAccessError` with plain messages.
- Context manager `temporary_clone()` → clone to `tempfile.mkdtemp()`,
  always `shutil.rmtree` in finally.
- Size guard: after clone, refuse Apply (scan still works) if > 200 MB working tree.
**Acceptance:** pytest with mocked subprocess: bad `full_name` rejected before any
  subprocess; cleanup runs even on exception.

### Task 77 — Stack detection + Dockerfile generation
**Files:** Create: `backend/services/autofix/detect.py`,
`backend/services/autofix/templates/Dockerfile.frontend`,
`backend/services/autofix/templates/Dockerfile.backend`,
`backend/services/autofix/templates/dockerignore`
**Do:**
- `detect_stack(path)` → `frontend` (package.json with vite/react), `backend`
  (pyproject/requirements containing fastapi/uvicorn), `fullstack` (both),
  `unknown`.
- `generate_dockerfiles(path)` writes missing files only (never overwrites an
  existing Dockerfile — finding type `dockerfile_present` is not fixable):
  - frontend template = this repo's proven `Dockerfile` pattern (node:20-alpine
    build stage → nginx serve) parameterized on `npm ci`/`npm run build`.
  - backend template = python:3.11-slim + `pip install .` + uvicorn `$PORT`.
- Templates ship with a matching `.dockerignore` when absent.
**Acceptance:** pytest fixture dirs: vite-app → frontend Dockerfile content
  contains `npm run build` + `nginx`; fastapi-app → contains uvicorn; repo that
  already has a Dockerfile → untouched, reported as present.

### Task 78 — Safe lint autofix runners
**Files:** Create: `backend/services/autofix/lint_runner.py`
**Do:**
- `run_eslint_fix(clone_path)`: only if `package.json` lists `eslint` AND a
  lockfile exists → `npm ci` (300s) → `npx eslint . --fix` (120s) → then
  `git diff --name-only` to collect fixed files; tool missing/timeout →
  finding `lint_skipped` with reason (never a 500).
- `run_ruff_fix(clone_path)`: only if `ruff` config exists or `ruff` in
  dev deps → `python -m ruff check --fix .` (60s) in a throwaway venv only if
  system ruff unavailable; otherwise skip with reason.
- Both return `{tool, fixed_files: [], remaining_errors: int, skipped_reason?: str}`.
- Subprocess rules (global): `shell=False`, `cwd=clone_path`, env =
  `{PATH, HOME, npm_config_cache=temp}` only, timeout kills the process tree.
**Acceptance:** pytest with fake repos + stub executables: fixable lint error →
  file changed + listed; no eslint in repo → `lint_skipped`, no crash; timeout path
  returns skipped with reason.

### Task 79 — Scan endpoint (dry run, no GitHub writes)
**Files:** Create: `backend/routers/autofix.py`; Modify: `backend/main.py`
**Do:**
- `POST /repo/autofix/scan` body `{project_id}` (project's repo from project row)
  → auth via existing `get_current_user`; token must exist (400 otherwise, message
  points to Settings).
- Response:
  ```json
  {"repo":"owner/name","stack":"frontend","clone_mb":12,
   "findings":[{"type":"missing_dockerfile","fixable":true,"detail":"No Dockerfile found"},
               {"type":"lint","tool":"eslint","fixable":true,"detail":"14 errors, 11 auto-fixable"},
               {"type":"lint","tool":"ruff","fixable":false,"detail":"ruff not configured"}],
   "apply_enabled":true,"apply_blocked_reason":null}
  ```
- Dry run: fixers may run **inside the temp clone** to count fixables, but nothing
  is pushed and the clone is deleted. Rate limit: 20 scans/user/day.
**Acceptance:** pytest (mocked repo service + lint runners): findings shape exact;
  no-token → 400 with Settings pointer; blocked repo → `apply_enabled:false` +
  reason string.

### Task 80 — Apply endpoint (fix → branch → push → PR)
**Files:** Modify: `backend/routers/autofix.py`, `backend/services/autofix/repo_service.py`
**Do:**
- `POST /repo/autofix/apply` body `{project_id}`:
  1. Clone; run detection + fixers; if `git diff` is empty → 200
     `{"status":"no_changes","message":"Nothing to fix — repo is already healthy."}`
     (no branch, no PR).
  2. Branch `aether/autofix-{UTC timestamp}-{short random}`; commit
     `fix(aether): generate Dockerfile + eslint --fix` (list files in body).
  3. `git push origin branch` with PAT; open PR via GitHub API
     `POST /repos/{full}/pulls` (title: "Aether Auto-Fix: Dockerfile + lint",
     body: findings table) → `pr_url`.
  4. Insert `autofix_runs` row; return `{status:"pr_opened", branch, pr_url, files:[...]}`.
- All git auth via the encrypted token; the token is read once per run and wiped
  from memory refs after (best effort in Python).
**Acceptance:** pytest with fully mocked git/GitHub: no-changes path creates no
  branch; happy path asserts branch name regex, PR created, run row written;
  push failure → `status:"failed"` + run row + no exception leak of the token.

### Task 81 — Guardrails: rate limits, audit, redaction
**Files:** Modify: `backend/routers/autofix.py`, `backend/routers/github_token.py`,
`backend/services/audit_service.py` (reuse)
**Do:**
- Per-user apply limit: 10/day (count from `autofix_runs`), 429 with reset time.
- Audit log on: token save/delete (metadata only), scan, apply success/failure.
- Central `redact(text)` used by all new routers before any `logger.*` call
  (replaces token, `x-access-token:...@`, and `Authorization:` patterns).
- Branch-name guard: `assert branch.startswith("aether/autofix-")` immediately
  before push — defense in depth.
**Acceptance:** pytest: 11th apply in a day → 429; audit rows exist for each
  action; a log line containing the raw token is impossible (redact unit test).

### Task 82 — Frontend: GitHub Auto-Fix settings card
**Files:** Create: `src/components/settings/GitHubAutoFixCard.tsx`;
Modify: `src/pages/Settings.tsx`, `src/services/api.ts`
**Placement decided with user: inside the Deployment Providers card** (below the
GitHub Username field), not a standalone card — single place to paste the PAT,
with Connect (= add new key) and Disconnect-with-confirm (= delete).
**Do:**
- Password-type input for PAT + helper link to classic token creation (repo scope)
  + "Connect" → `POST /settings/github/token`; success shows `Connected as @login
  (…last4)`; "Disconnect" → DELETE with confirm.
- Status fetched on mount (`/settings/github/token/status`); demo/offline mode:
  card shows "Available in API mode" and disables inputs.
- Never store the token in localStorage/state after submit (controlled input,
  cleared on success).
**Acceptance:** `npm run build` passes; card renders in demo mode without errors;
  with API: connect → status → disconnect flow works.

### Task 83 — Frontend: Repo Health panel on ProjectDetails
**Files:** Create: `src/components/RepoHealthPanel.tsx`;
Modify: `src/pages/ProjectDetails.tsx` (new "Repo Health" tab entry)
**Decided with user (Q2): button inside the Infrastructure tab instead of a new
tab** — implemented as `<RepoHealthPanel projectId>` at the top of the
Infrastructure tab content (no new tab, no tab-order change).
**Do:**
- "Scan repository" button → `POST /repo/autofix/scan` → findings list with
  icons (Dockerfile missing / lint fixable / lint skipped + reason).
- "Apply fixes & open PR" (disabled when `apply_enabled:false`, tooltip shows
  `apply_blocked_reason`) → progress states (Cloning… → Fixing… → Pushing… →
  Opening PR…) → success view with branch name + clickable `pr_url` + files changed.
- "No changes" response → calm success state, no PR link.
- Run history: last 5 from a `GET /repo/autofix/runs?project_id=` (add this small
  GET in Task 79's router) — status badges + PR links.
**Acceptance:** Full click-through against a test repo: scan → apply → PR URL
  opens a real PR containing a generated Dockerfile; build passes.

### Task 84 — Tests + security review + docs
**Files:** Modify: `README.md` (Auto-Fix section), this file (results)
**Do:**
- Backend: pytest suite from Tasks 75–81 green locally and in CI (Task 70's job).
- Frontend: `npm test` + `npm run build` green.
- Security review pass (before merge to main): token lifecycle (write-only input,
  encrypted rest, redacted logs, revocable), branch guard, subprocess hardening,
  RLS on both new tables, no secrets in `autofix_runs`.
**Security sign-off (2026-10-15, code review — implementer):**
- Write-only input: `GitHubAutoFixCard` holds the PAT in a controlled input,
  clears state on success, never writes localStorage (`src/components/settings/GitHubAutoFixCard.tsx`).
- Encrypted rest: Fernet via reused `services/plugins/crypto.py` (`routers/github_token.py`);
  API returns login + `last4` only; 7 unit tests assert the secret never appears in responses.
- Redacted logs: `redact()` covers the token value + embedded-credential URLs at
  every raise/log boundary (`services/autofix/repo_service.py`, `routers/autofix.py`);
  dedicated test asserts a token-bearing git error surfaces token-free.
- Revocable: `DELETE /settings/github/token` + README tells users to revoke on GitHub too.
- Branch guard: `push_and_open_pr` refuses non-`aether/autofix-*` branches; the
  router generates the branch name itself; unit test covers the refusal.
- Subprocess hardening: `shell=False` on all calls, timeouts (npm 300s / eslint
  120s / ruff 60s / git 60s / clone 120s), filtered env for npm, PATH-only env
  for push, structured tempdir cleanup via context manager.
- RLS: `user_id = auth.uid()` policies on both tables (`backend/autofix_schema.sql`).
- No secrets in `autofix_runs`: rows hold findings/branch/pr_url/redacted error only.
- Residual risk accepted: apply executes repo-defined tooling — documented as
  "trusted repos only" in README §7f.
- README: "Auto-Fix (beta)" section — what it does, PAT scope advice, honest
  limitations (trusted repos only: linters execute repo-defined code; 200 MB cap;
  lockfile required for JS fixes).
- Record manual E2E evidence here: test repo link, PR link, run row id.
**Acceptance:** All suites green in CI; security checklist signed off in this file;
  a non-coder can connect → scan → apply without reading any code.
**Test evidence (2026-10-15):** backend `pytest tests -q` → **176 passed**
(132 pre-existing + 44 new); `npm test` 8/8; `tsc` clean; `npm run build` exit 0.
Live mechanics E2E (no PAT): real anonymous clone of public
`vitejs/awesome-vite` via `temporary_clone` → stack=unknown, 0.1 MB, nothing
generated, temp dir cleaned — no traceback, no leftover.
**Still needs a human with a PAT (cannot be done by an agent without secrets):**
connect with a real classic PAT → scan a test repo → apply → open the PR URL →
paste the test repo link, PR link, and run row id here; `npm test` + pytest
must also go green in CI after push (Task 70's job covers both).

**AI-fix extension (user decisions 2026-10-16):** code fixes use **OpenAI only**
(gpt-4o-mini; `OPENAI_API_KEY` in `backend/.env`, added by the user — never in
chat). Policy: SMALL problems auto-fix (one file, ≤5 errors, ≤30 KB, max 5
AI files per apply; each fix re-linted, kept only if errors drop, reverted
otherwise); LARGE problems are never auto-fixed — triage tickets are created
instead (incident rows, `source: "autofix"`, severity critical>20/high>10/medium,
cause hint + suggested action in the description). Flow Q1(a): AI runs
automatically inside Apply behind an opt-in checkbox (default on when a key is
configured; scan states exactly which files leave the server). Flow Q2(a):
triage tickets auto-created during Apply, shown next to the PR link.
`use_ai` flag on `POST /repo/autofix/apply`; scan returns `ai_available` +
per-file `automation` tags (`ai`/`triage`/`lint`/`template`/`none`).

## Phase 9 - Incident Tickets (Assign + real Feedback/Activity)

User requests 2026-10-16: (1) confirm autofix triage tickets land on the
Incidents page; (2) replace ticket-detail Share button with Assign (admin-only,
dropdown of project teammates); (3) make Feedback and Activity tabs real
(who wrote what; resolve/ignore/assign attributed by name).
User UI decisions: Assign for admins + Share kept for everyone else; assignee
stored as member name; feedback history shows all entries newest-first; actor
embedded in activity text (no timeline migration).

### Task 85 - Backend: feedback history + actor-stamped timeline
**Files:** Modify: `backend/routers/incidents.py`, `backend/models/incident.py`.
**Do:**
- `POST /feedback` writes one row to the new `incident_feedback` table (author
  + time) while mirroring the legacy `feedback_is_real` / `feedback_comment`
  columns; returns the row so the UI can render it.
- `GET /{id}` returns `feedback` newest-first (missing table degrades to `[]`
  with a warning until the SQL is run); `IncidentResponse` gains
  `feedback: List[Any] = []`.
- Actor embedded in event text via `_actor()` / `_timeline()` helpers (inserts
  are non-fatal): resolve → "Incident resolved by {email}"; ignore endpoint
  gains its missing insert ("Ignored by {email}: {reason}"); comment events
  carry the author; PATCH writes "Assigned to {X} by {email}" only when the
  assignee actually changed (no duplicate trail).
**Acceptance:** 10 new tests in `backend/tests/test_incident_history.py` green;
  full suite stays green.

### Task 86 - SQL: incident_feedback history table
**Files:** New: `backend/incident_feedback_schema.sql`. Modify: `README.md`
(§7 step 3 list, §7f triage-ticket note).
**Do:** `incident_feedback` (id, incident_id → cascade, user_id, user_name,
is_real, comment, created_at) + (incident_id, created_at DESC) index + `owner`
RLS mirroring `incident_comments` + authenticated/service_role grants.
Idempotent, run after `supabase_schema.sql`.
**Acceptance:** app works before the SQL is run (empty history, columns still
update); full history after one Supabase run.

### Task 87 - Frontend: Assign + real Feedback/Activity
**Files:** Modify: `src/types/platform.ts`, `src/context/PlatformContext.tsx`,
`src/pages/Incidents.tsx`.
**Do:**
- Header: Assign dropdown (project teammates with avatar + name + role,
  click-outside, current assignee highlighted) for project admins (solo users
  default to admin, matching existing convention); Share kept for everyone else.
  Selecting writes PATCH `assigned_to` (member name); sidebar Assignee row
  updates as before; backend writes the assign trail.
- Ignore routed via the dedicated `POST /ignore` endpoint instead of generic
  PATCH — the old path never sent `ignored_reason` (silently dropped
  server-side; now mapped anyway + regression-tested). New context
  `ignoreIncident` with audit entry.
- Feedback tab: history list (avatar, name, relative time, real/false-positive
  badge, comment) above the form; Submit disabled until real/false-positive is
  chosen; one history row per submit via new `submitIncidentFeedback` (legacy
  columns updated too).
- Detail hydration: new `loadIncidentDetail` on ticket select fetches
  `GET /{id}` and maps server comments/timeline/feedback into state — these
  were previously never fetched, so all history vanished on reload. Broadcast
  merge preserves `feedback`.
- Activity: widened timeline types + icons for resolve/ignore/assign/feedback;
  "actions" filter now covers all non-comment timeline events.
**Acceptance:** `tsc` clean, `npm test` 8/8, `npm run build` exit 0.

**Test evidence (2026-10-16):** backend `pytest tests -q` → **200 passed**
(190 pre-existing + 10 new); `npx tsc --noEmit` clean; `npm test` 8/8;
`npm run build` exit 0. Triage tickets verified to land in the same `incidents`
table (list filters by user projects only, no source exclusion); README §7f
documents it.
**Still needs a human (one Supabase run):** execute
`backend/incident_feedback_schema.sql` once — until then feedback history reads
empty while columns and the feedback form keep working.
**Done 2026-10-16:** user ran the file in Supabase — full history live, no code
changes needed (graceful-degradation path now inactive).

## Phase 10 - Push → Pipeline + triage real-time + CI env (2026-10-16)

User report: only manually-dispatched builds appear; new commits never trigger
runs. Root cause (verified, no watcher existed): deployments were created only
by manual dispatch, manual Vercel sync, or provider webhooks — nothing watched
the linked repo. Fix: in-process polling + live ticket broadcasts.

### Task 88 - repo_poll auto-build (push → pipeline, zero setup)
**Files:** Modify: `backend/routers/deployments.py`, `backend/services/scheduler_service.py`,
`backend/routers/scheduled_tasks.py`, `backend/routers/projects.py`,
`src/pages/AutomationHub.tsx`. New: `backend/tests/test_repo_poll.py` (10 tests).
**Do:**
- Extracted `_dispatch_build_run` from `dispatch_build` (manual path behavior
  identical: same normalization, same `manual-{project}-{time}` event IDs, same
  500 on failure; regression test pins it).
- New `repo_poll` scheduled-task type: polls branch HEAD SHA on cron (default
  `*/5 * * * *`); first sighting seeds silently (no backfill storm); changed
  SHA dispatches the exact manual flow with the new commit's message/author.
- `ensure_repo_poll_task` (idempotent) auto-creates one enabled task per
  repo-linked project: at scheduler startup (covers existing projects) and on
  project create/update (covers newly linked repos). No new table/column —
  `last_sha` lives in `task_config`.
- `_job_wrapper` re-reads the task row every fire (stale captured dict would
  re-dispatch the same commit forever; also makes UI edits/deletes take effect
  without restart; orphaned jobs self-remove). `schedule_task` live-adds jobs;
  `run_task_now` and manual task creation work for the new type.
- `_TASK_TYPES` allow-list + AutomationHub `TASK_META`/desc/icon entries.
- **History backfill (same task):** first pass imports recent GitHub Actions
  runs as deployment rows (real conclusions → ready/failed/building/canceled;
  unknown conclusions skipped, never fabricated), deduped by `gha-{project}-{run}`
  event IDs; a `backfilled` flag migrates pre-existing tasks. Repos without
  Actions just track HEAD. This is what makes *every past version* visible,
  not just future pushes.
**Caught by the new tests:** `asyncio.create_task` is not `add_task`-shaped
(scheduler passes an adapter now).

### Task 89 - triage tickets real-time + up-to-date version
**Files:** Modify: `backend/services/autofix/triage.py`,
`backend/services/autofix/repo_service.py`, `backend/routers/autofix.py`.
Tests: 5 new in `backend/tests/test_autofix_triage.py`.
**Do:**
- Every ticket create/refresh broadcasts to the project team
  (`incident.created` / `incident.changed` via existing `broadcast_to_project`);
  frontend already handles both, so tickets appear live, no refresh. Broadcast
  failures never break ticket creation (awaited, fully guarded).
- Tickets stamp the scanned version: `clone_head_sha` (exact `rev-parse HEAD`
  of what was scanned) + project branch into `security_metadata` and a
  "Scanned version: branch@sha" description line.
- Dedup: open ticket for same file+tool and same SHA is reused silently; a new
  SHA refreshes the row in place (title/description/severity/metadata) instead
  of duplicating. Dedup lookup fails open so triage never blocks an apply run.
**Acceptance:** 7/7 triage tests; full suite green.

### Task 90 - CI backend env (fix/ci-supabase-env)
**Problem:** CI backend job failed with `supabase_url is required` (run
38838145986) — CI has no `.env`; tests instantiate the client during
`monkeypatch.setattr` on the lazy proxy. Reproduced locally (44 failed, no env).
**Fix (proven, not guessed):** dummy non-secret env in the backend job —
`SUPABASE_URL=http://localhost:54321`, JWT-shaped anon/service keys
(supabase-py regex-validates key shape; plain `test-key` raises "Invalid API
key"), Fernet-shaped `FERNET_KEY` (zero-entropy, needed by the encrypt/decrypt
roundtrip test). Verified: **210 passed with no `.env` file using exactly these
values** (all tests fully mock the client; zero network).
**Status:** commit `9a2a8af` on branch `fix/ci-supabase-env` (ci.yml only).
Push/PR blocked: no GitHub auth in this environment (credential-manager GUI
hangs, no `gh`, no token) — run `git push -u origin fix/ci-supabase-env`
then open the PR yourself.
**Robust follow-up (documented, not needed):** `database.py` is already lazy
(`_LazyClient` proxy); no code change required.

**Test evidence (2026-10-16):** backend `pytest tests -q` → **218 passed**;
`npx tsc --noEmit` clean; `npm test` 8/8; `npm run build` exit 0.

**5-lane parallel review (2026-10-16, all lanes + full suite re-run):**
scheduler/poll/backfill, deploy/projects/tasks routers, triage/autofix,
frontend, tests+CI. Fixed from findings: `clone_head_sha` never raises;
wrapper refresh-failure skips instead of unscheduling; backfill dedup-read
failure aborts (no duplicate storm); per-run guard in backfill loop; triage
audit logs guarded (no 500-after-write); refresh broadcast carries full row;
dead top-level `httpx` import removed; dedup test forbids updates; history
fake honors `in_()`. Rejected with rationale: frontend `resolved` matches
server truth (not `ignored`); first-tick silent track is correct when no
Actions runs exist; dispatch-then-record ordering fails toward visible
duplicate, never silent loss. CI env block verified present on
`fix/ci-supabase-env` (reviewer read main, where it lives on the branch).

---

## Execution Order Summary

```
Phase 1  → Tasks 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14
                                                                             ✅
Phase 1.5 → Tasks 43 → 44 → 45 → 46 → 47 → 48 → 49 → 50 → 51 → 52 → 53 → 54 → 55
                                                                                   ✅
Phase 2 Backend → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 24 → 25
  → 26 → 27 → 28 → 29 → 30 → 31 → 32 → 33 → 34                                          ✅

Phase 2 Infra   → 35 → 36 → 37 → 38 → 39 → 40 → 41 → 42

Phase 3 Plugins → Batches 0 → 1 → 2 → 3a → 3b → 4                                      ✅
Phase 4 Scanning → Trivy service → OSV audit → scheduler + scan endpoint              ✅
Phase 5 Deploy → Dockerfile → netlify.toml → compat audit                             ✅
Phase 6 Gaps → 56 → 57 → 58 → 59 → 60                                      ✅

Phase 7 Onboarding → 61 setup → 62 update → 63 compose fix → 64 ports → 65 README
  → 66 env example → 67 cross-platform launcher → 68 health honesty → 69 doctor
  → 70 CI tests → 71 packaging honesty → 72 demo banner → 73 fresh-clone verify
                                                                                 ✅
Phase 8 Auto-Fix → 74 schema → 75 token API → 76 repo service → 77 detect+Dockerfile
  → 78 lint runners → 79 scan → 80 apply+PR → 81 guardrails → 82 settings UI
  → 83 Repo Health UI → 84 tests+security review                               ✅ code-complete
  Pending human step: real-PAT E2E (connect → scan → apply → PR) + CI green after push.
Phase 9 Tickets → 85 backend history+actors → 86 feedback SQL → 87 Assign+Feedback/Activity UI
                                                                                  ✅
  Human step done: `backend/incident_feedback_schema.sql` run in Supabase 2026-10-16.
Phase 10 Push→Pipeline → 88 repo_poll auto-build → 89 triage real-time+version → 90 CI env
                                                                                  ✅
  Human steps: `git push -u origin fix/ci-supabase-env` + open the PR (auth-blocked here).
```

---

## Current Status at a Glance

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1 — Frontend UI | 1–14 | ✅ Complete |
| Phase 1.5 — Team UX + Plugins | 43–55 | ✅ Complete |
| Phase 2 — Backend Code | 15–34 | ✅ Implemented |
| Phase 2 — Infrastructure | 35–42 | ✅ Implemented (k8s/, argocd/, build-push.yml exist; deploy job in ci.yml is a no-op — fixed in Task 70) |
| Phase 3 — Plugin Adapters (B0–B4) | batches | ✅ Implemented |
| Phase 4 — Security Scanning | trivy+OSV | ✅ Implemented |
| Phase 5 — Free Deploy Compat | docker+netlify | ✅ Implemented |
| Phase 6 — AI + Honesty Gaps | 56–60 | ✅ Implemented |
| Phase 7 — Non-Coder Onboarding | 61–73 | ✅ Complete (_verified 2026-10-15: setup/update/doctor/dev/compose all pass in fresh copy; 3 bugs fixed: pip-exe self-upgrade, Trivy 0.66.0 404→0.76.0, doctor IPv6+8000 fallback_) |
| Phase 8 — Repo Auto-Fix (PAT) | 74–84 | ✅ Code-complete 2026-10-15 (176 pytest, 8 vitest, build green; security checklist signed; UI per user decisions: dismissible banner, infra-tab button, default settings card). Pending: real-PAT E2E + CI green after push |
| Phase 9 — Incident Tickets (Assign/Feedback/Activity) | 85–87 | ✅ Complete 2026-10-16 (200 pytest, 8 vitest, tsc + build green; UI per user decisions: Assign for admins + Share for others, assignee = name, full history newest-first, actors in text; `incident_feedback_schema.sql` run in Supabase by user) |
| Phase 10 — Push→Pipeline + triage real-time + CI env | 88–90 | ✅ Complete 2026-10-16 (215 pytest, 8 vitest, tsc + build green; pushes auto-dispatch via repo_poll, tickets broadcast live with version stamps + dedup). Pending: push `fix/ci-supabase-env` + open PR (auth-blocked here) |
