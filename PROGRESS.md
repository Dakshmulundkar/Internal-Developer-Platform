# Aether IDP — Production-Grade Audit & Optimization

## Goal

Audit and harden the existing app across 16 phases: measure first, fix real
security/performance/reliability issues with small verified changes, never
rewrite, and never break an existing feature.

- Baseline codebase: React 18 + Vite 8 (Rolldown) frontend, FastAPI + Supabase backend.
- Preserve every feature. Change nothing that weakens auth, RLS, or CORS.
- Keep the service-role data layer (documented design decision, RLS bypassed by
  design — re-implemented RBAC server-side).
- Verify after each change: `python -c "import main"`, `py_compile`, `npm run build`.

## Plan (16 phases)

1. Exploration & architecture map (done)
2. Baseline: build metrics (done)
3. Login bottleneck diagnosis (done — stats below)
4. Bundle split / lazy loading (already in place; verify)
5. Auth & auth-time data race flush (verified — single-flight refresh present)
6. Network congestion: phase config (frontend batching on login + filtering)
7. Security: webhook verification, rate limiting, error messages
8. Security: RBAC/tenant data isolation audit
9. Reliability: monitors & daemons
10. Reliability: error handling, ordering, idempotency
11. Performance: backend queries & caches
12. Performance: frontend context split & memoization
13. Rollout: staged, verified deployments of the fix set
14. Audit log & webhook-focused fixes
15. Strictness fixes backed by re-phase
16. Report: findings without changes (service-role notes, dead code, RLS, etc.)

## Now

Phase 13 rollout in progress. Curated fix set (each change small + verified):

Backend:
- [x] Rate limiter added (`backend/rate_limit.py`) — fixed-window, per IP+path,
      no deps. Wired into auth login/register/refresh/github endpoints.
- [x] Webhooks fail closed in production when secret is missing (github/github_security,
      grafana, vercel, netlify) — dev keeps lenient mode with warning.
- [x] Automation engine global rules scoped to rule owner's projects (C2 fix).
- [x] SSRF guard in service_prober for custom targets (loopback/private/link-local/metadata blocked).
- [x] Generic 500 error messages in monitoring probe/trigger, plugins, auth register/github.

Frontend:
- [x] Remove Dashboard double audit fetch (uses context auditLogs), memoize derived data.
- [x] Settings: drop misleading `return clearTimeout` from event handler.
- [x] CommentSection: cancelled-guard the load effect.
- [x] PlatformContext/Header: try/catch localStorage init; memoize unread count.
- [x] Run `npm run build` — passed (tsc clean); rebuild 3.83s, Dashboard chunk 23.27 kB / gz 5.67.

Open: Phase 16 report below.

## Decisions / Guardrails

- Never print credential values. Env secrets stay out of logs and the repo.
- `custom_url` probes and plugin "test connection" must not reach private networks (SSRF).
  The prober's hardcoded demo target (`https://testing-brown-delta.vercel.app`) stays allowed.
- Webhook fail-open is acceptable only outside production and only with a warning log.
- Do NOT delete the dead issues domain (IssueKanbanBoard/useIssues/issuesApi/
  boardStore/dashboardStore/queryKeys) without user approval — verified unused,
  reported in Phase 16 instead.
- Supabase service-role data access + RLS bypass is a deliberate design: report,
  do not silently change.
- Incidents comments/timeline already use one sync supabase client; "parallelize"
  offers no benefit without thread offload — left as-is (noted in report).

## Environment Facts (baseline)

- repo HEAD: e5d1790 "v0.1"; working tree clean
- Build baseline: 8.91s, 2113 modules; initial ~91 kB gz (vendor-react 43.09 gz,
  index 25.54 gz); recharts chunk (~102 kB gz) loads on Dashboard only
- backend venv Python 3.14.3; `import main` OK
- Local `ENVIRONMENT=development`; k8s base configmap defaults `production`
  (dev/staging overlays override to dev/staging)
- `rg` unavailable on this Windows shell — use grep tool / Select-String

## Phase 16 Report — Findings Without Changes

Items deliberately reported at audit end. Severity: S=security, P=perf, R=reliability.

### Design decisions to keep as-is (documented, do not silently change)
1. **Service-role data layer bypasses RLS** (S). All data ops use one shared
   service-role client (`backend/database.py`) — RLS is off by design; authorization
   is re-implemented server-side per endpoint. *Action if ever changed:* switch to
   user-scoped JWTs + Postgres RLS policies; requires auth refactor + RLS policy set.
   Until then: never ship the service key to the client, keep owner/tenant scoping
   in every router handler.

### Perf / reliability findings (no change made)
2. **Sync supabase client blocks the event loop** (P/R). Async routes call sync
   `supabase.table(...)` — each query stalls the loop a few ms; under burst scaling
   it compounds. *Options:* `asyncio.to_thread` wrappers, or async supabase client.
3. **Identity/project cache TTL 30s** (`dependencies.py`) means role/project changes
   take ≤30s to propagate mid-session. Acceptable; add explicit cache invalidation
   on role/RBAC/profile writes later if hit.
4. **Monitoring.tsx double-poll** (P/R). Page runs its own 6s alerts poll plus the
   context-level poll → duplicate API traffic + risk of stale alert flash. Anchor the
   page to context state or centralize polling.
5. **Login path still fans out ~9 parallel requests** after auth (Phase 3). Frontend
   batching is deferred; a batch identity+overview endpoint would cut it.
6. **Rate limiter is per-process** — fine for the current single-replica prod; a
   multi-replica rollout needs a shared (redis/db) limiter or per-pod limits accepted.

### Minor
7. **`poll_rollback_status`** background task fetched the vercel/netlify plugin token with
   `.eq("plugin_id","vercel").limit(1)` — not tenant-scoped. **Fixed (FIX-L)** — token
   lookup now scoped to the project owner's installation (`installed_by = projects.owner_id`).
8. **Default demo mode**: root `.env` `VITE_API_URL`/`VITE_USE_API` empty → frontend
   ships with seed data unless API mode configured. Confirm this is intended for dev;
   production builds should always have `VITE_API_URL` set.
9. **Webhook fail-closed now depends on secrets being present in prod** — add
   `GITHUB_WEBHOOK_SECRET`/`GRAFANA_WEBHOOK_SECRET` to the prod env store (k8s
   secret/configmap) so the fail-closed 503 path is never hit in normal operation.

### Removed this session (user-approved dead code)
10. Deleted `IssueKanbanBoard.tsx`, `useIssues.ts`, `issuesApi.ts`, `boardStore.ts`,
    `dashboardStore.ts`, `queryKeys.ts` — issues domain was wired to nothing
    (verified by repo-wide grep; not referenced by App/routes/pages). Rebuild after
    deletion: `tsc && vite build` passes (2.07s).

## Post-Audit: Automation / Scheduled Tasks Redesign

### Goal
Redesign the two sidebar pages ("Automation", "Scheduled Tasks") into one cohesive,
native-feeling hub — unified design, responsive, accessible, fully functional, no fake
functionality, no backend contract changes. Jira/Slack used only as interaction
references.

### Work delivered
- `src/types/automation.ts` — shared `AutomationRule` / `ScheduledTask` types.
- `src/pages/AutomationHub.tsx` — unified page (~1500 lines): page header card, tab
  switcher (Event rules / Scheduled tasks), toolbar (search + trigger/type + status +
  project filters), card rows with drag-reorder + bulk-select (rules), Pause/Resume +
  Run now (tasks) + More menu (Duplicate/Delete all wrapped in a custom `ConfirmDialog`,
  no `window.confirm`), rules composer (details rail + WHEN/IF/THEN sections, Test rule,
  recent-activity), tasks composer (type cards, preset + advanced cron with live
  next-run, config), scheduler status chip, skeleton loading, success/error banners,
  empty + no-match states (with clear-filters).
- `src/pages/Automation.tsx` / `src/pages/ScheduledTasks.tsx` — gutted to thin wrappers
  (`<AutomationHub initialTab="rules" />` / `initialTab="tasks"`); named exports kept
  for `App.tsx` lazy imports.
- `src/index.css` — `prefers-reduced-motion` neutralization added.

### Honesty constraints honored
- Rules: no Run-now (backend has none) — real "Test rule" kept.
- Pause/Resume = existing `enabled` PATCH on both domains.
- Duplicate = real create-from-payload, saved as paused.
- Scheduled tasks have no execution-history endpoint — only `last_run_at` shown.
- Scheduler status maps 1:1 to backend `get_scheduler_status()` (`available/running/jobs`).
- Backend untouched.

### Verification
- `npm run build` (= `tsc && vite build`) passes. Chunks: `AutomationHub-*.js` 48.75 kB
  (gz 10.81), wrapper pages 0.27 kB each (shared lazy chunk reused by both routes).
- API contracts cross-checked against `src/services/api.ts` (`listRules`, `listExecutions`,
  `testRule`, `createRule`, `updateRule`, `deleteRule`, `scheduledTasks.*`) and backend
  `routers/scheduled_tasks.py` + `services/scheduler_service.py`.
- Fixed during review: composers were defined but never rendered (`view === 'composer'`
  returned null — blank page); double-fetch on mount caused by the `initialTab` reset
  effect reloading after the tab-load effect.

### Limitations (deferred)
- Reorder by drag is pointer-based (as before); no keyboard fallback.
- No live end-to-end interactive test — requires Supabase creds + running backend
  (manual QA checklist in Phase 18 notes).
- `src/types/issues.ts` remains as a dead-type leftover (not part of approved removal).

## Phase 8 / 16 update — Multi-Tenant Isolation Audit (2026-09-13)

Read-only audit completed → `SECURITY_AUDIT.md` at repo root (architecture, tenancy
model, RBAC matrix, RLS audit, API findings A–P). All High + Medium fixes below were
applied incrementally afterward, each verified (compileall + import main + guard tests
+ `npm run build`). No RLS change, no schema change, no credential rotation.

### High (applied)
- **FIX-A** `/monitoring/events`: anonymous alert injection closed — anonymous callers
  are rejected unless they send `X-Event-Intake-Secret` matching `EVENT_INTAKE_TOKEN`
  (new `config.py` setting, fail-closed when unset).
- **FIX-B** `/upload` fail-closed: every upload now requires an existing parent
  (`comment_id` + type) and project membership; orphan/cross-tenant uploads rejected.
  Note: bucket stays public-by-default (documented residual Medium) — private-bucket +
  signed-url migration is a follow-up.
- **FIX-C** `/plugins/test` SSRF guard via prober `_assert_safe_target`; `follow_redirects=False`.
- **FIX-D** `rollback_service.execute_rollback`: resolved deployment must belong to the
  caller's project before any provider call or operation row.
- **FIX-E** `service_prober`: new `_safe_get` re-asserts target safety on each redirect hop
  (blocks redirect-to-metadata/internal bypass); all probe fetches use it.

### Medium (applied)
- **FIX-G** WebSocket broadcast filters `team_members.status='accepted'` (invited/declined
  users no longer receive project events).
- **FIX-F** Automation webhook action: URL must pass `_assert_safe_target`; no redirect follow.
- **FIX-H** Automation rules re-verify rule-owner project access (owner or accepted member)
  at fire time — no firing after membership revoked.
- **FIX-I** Automation `notify` target restricted to the project owner/accepted members
  (cross-tenant notification spam closed).
- **FIX-J** Share-link passwords now PBKDF2-HMAC-SHA256 (600k iter, per-link salt);
  constant-time verify; legacy SHA-256 hashes still verify and auto-upgrade.
- **FIX-K** `/team/search` + `add_team_member` user lookups paginated with a 1000-user cap
  (no full auth.user dump); `/team/search` rate-limited (30/min).
- **FIX-L** Rollback status polling token lookup scoped to the project owner.

### Remaining (documented in SECURITY_AUDIT.md §26)
- RLS is bypassed by the service-role data layer by design (owner-centric policies are
  latent defense only); private-bucket migration for attachments (FIND-B residual);
  `audit select(*)` (FIND-N); untyped incident body (FIND-O); AI analyze rate limit (FIND-P);
  `/monitoring/sync` global trigger (FIND-M).