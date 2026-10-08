# Implementation Phases
# Aether IDP — Internal Developer Platform

**Version:** 1.6
**Last Updated:** September 2026

---

## Phase Overview

```
Phase 1      Phase 1.5        Phase 2 (Backend)      Phase 2 (Infra)
──────────   ─────────────   ───────────────────    ─────────────────
Tasks 1–14   Tasks 43–55     Tasks 15–34            Tasks 35–42
UI only      Plugin data     FastAPI + Supabase      Docker, K8s, ArgoCD
             + Team UX       + Real integrations
✅ Complete  ✅ Complete      ✅ Implemented         📋 Spec ready
```

```
Phase 3              Phase 4              Phase 5              Phase 6
─────────────────    ─────────────────    ─────────────────    ─────────────────
Plugin adapters      Security scanning    Free deploy          AI + honesty gaps
Batches 0–4          Trivy + OSV          Netlify + Railway    (new work items)
✅ Implemented       ✅ Implemented       ✅ Implemented       📋 Spec ready
```

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

## Phase 6 — AI + Honesty Gaps (new work, not yet implemented)

**Status:** 📋 Spec ready — do not present the items below as done.

### Task 56 — Real rollback execution end-to-end
**Gap:** `backend/services/rollback_service.py:115,247` — no provider token proceeds in simulated mode; status polling falls back to success on timeout. A rollback can report success without anything happening.
**Do:** require a real provider token (fail closed with a clear error), poll actual provider state until terminal, remove the timeout-success path. Verify with a fixture test that asserts failure when no token exists.

### Task 57 — AI chat with context and memory
**Gap:** `backend/services/ai_service.py::analyze_incident` is single-shot — JSON context in, answer out. No conversation is persisted (no history table is written), so follow-up questions start from zero every time.
**Do:** persist per-incident/per-project chat turns (new `ai_chat_messages` table or `ai_analyses` extension), feed the last N turns into the prompt, cap context length. Frontend keeps ephemeral state only — no frontend change needed beyond what exists.

### Task 58 — AI-generated incident remediation steps
**Gap:** `src/pages/Incidents.tsx::getRemediationSteps` parses canned `aiExplanations[deploymentId]` seed text with keyword→icon regexes. Steps are static fixtures, not generated for the incident at hand.
**Do:** generate steps per incident from the backend (`analyze_incident` output or a dedicated `/incidents/{id}/remediation` endpoint) using live fields — error message, failed stage, provider, recent logs. Cache per incident; fall back to the current 3-step generic list only when the backend is unreachable, labeled as generic.

### Task 59 — Sentry Issues tab has no backend
**Gap:** `src/pages/Monitoring.tsx` hardcodes `sentryIssues = []` when the API is available. The tab renders "No issues" forever in production.
**Do:** wire a real fetch (Sentry issues endpoint exists in `sentry_service.py`, currently only used by sync) or remove the tab until it exists.

### Task 60 — Remaining honesty items (from audit, unowned)
- OAuth `oauth`/`basic_auth` methods have no real UI flow beyond the Slack/Teams buttons.
- ~16 catalog plugins are installable with tests that cannot pass until Batch 3-style backends land — badge them "coming soon" or gate install.
- `FERNET_KEY` rotation story; per-plugin `refreshSeconds` (50 plugins × 30s polling won't scale); catalog-health admin view.
- Demo/seed fallbacks still present across `PlatformContext` and pages; session persistence still JWT-only in the working tree.

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
Phase 6 Gaps → 56 → 57 → 58 → 59 → 60                                    📋 Spec ready
```

---

## Current Status at a Glance

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1 — Frontend UI | 1–14 | ✅ Complete |
| Phase 1.5 — Team UX + Plugins | 43–55 | ✅ Complete |
| Phase 2 — Backend Code | 15–34 | ✅ Implemented |
| Phase 2 — Infrastructure | 35–42 | 📋 Spec Ready |
| Phase 3 — Plugin Adapters (B0–B4) | batches | ✅ Implemented |
| Phase 4 — Security Scanning | trivy+OSV | ✅ Implemented |
| Phase 5 — Free Deploy Compat | docker+netlify | ✅ Implemented |
| Phase 6 — AI + Honesty Gaps | 56–60 | 📋 Spec Ready |
