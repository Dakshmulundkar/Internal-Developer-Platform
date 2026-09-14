# Aether IDP — Multi-Tenant Isolation & Authorization Audit

Audit date: 2026-09-13. Read-only phase — no code, schema, RLS, or credentials were changed
during the audit itself. All fixes listed in "Changes implemented" were applied afterward,
incrementally, with verification per change.

---

## 1. Current architecture

React 18 + TypeScript + Vite frontend (single SPA, no Supabase client) → FastAPI backend
(`backend/`) → Supabase (Postgres + Auth + Storage). Single backend process also hosts
APScheduler (scheduled tasks), an automation rule engine, WebSocket broadcast, and
in-process rate limiting. External providers are driven server-side: Vercel, Netlify,
GitHub, Grafana, Datadog, Sentry, New Relic, Groq/OpenAI.

## 2. Actual service boundaries

- One FastAPI service, not microservices. Webhooks are separate modules but same process.
- No standing team/microservice infra in the repo. Do NOT artificially split.

## 3. Tenancy model

There is **no `teams` table and no organization/workspace**. "Team" is modeled as:
`team_members` rows bound to a **project** (`team_members.project_id → projects.id`).
The **project is the tenant boundary**.

## 4. Team model

`team_members(id, user_id, project_id, role, status, invite_token, invite_expires_at, added_by)`.
Roles: `viewer`, `developer`, `admin`, plus implicit `owner` (from `projects.owner_id`).
`status`: `invited | accepted | declined` (legacy rows default `accepted`).

## 5. Project model

`projects(owner_id UUID → auth.users, provider, vercel_project_id, netlify_site_id, ...)`.
A user may own many projects and be a member of many projects (multi-team via multiple
`team_members` rows). The same user can hold different roles in different projects.

## 6. RBAC model

- **Owner** = `projects.owner_id` (highest; sole rights to: delete project, assign admin,
  create share links, reveal it is used for `_caller_role`).
- **Admin/Developer/Viewer** = `team_members.role` for `status='accepted'`. Only owner+admin
  can manage team members; only owner can assign `admin` role.
- **Enforced server-side.** `dependencies.get_user_project_ids(user_id)` returns
  owned + accepted-membership project ids (10s TTL cache) and is the primary scoping helper.

Permission matrix (per project):

| Operation                        | Viewer | Developer | Admin | Owner |
|----------------------------------|:------:|:---------:|:-----:|:-----:|
| View project / deployments / incidents / alerts / comments / activities | ✓ | ✓ | ✓ | ✓ |
| Trigger deployments sync / probes / incidents / automations | ✓* | ✓ | ✓ | ✓ |
| Create incidents / comments / uploads | ✓ | ✓ | ✓ | ✓ |
| Rollback                      | ✓* | ✓ | ✓ | ✓ |
| Automate / schedule tasks     | ✓** | ✓ | ✓ | ✓ |
| Manage team members           | ✗ | ✗ | ✓ | ✓ |
| Assign admin role             | ✗ | ✗ | ✗ | ✓ |
| Delete project / strip owner role | ✗ | ✗ | ✗ | ✓ |
| Create share links            | ✗ | ✗ | ✗ | ✓ |

*Backend currently honors membership only (not the viewer/developer split) for these actions.
**Only in the user's own project; CRUD is owner-only.

## 7. Resource ownership model

| Resource | Parent | Ownership proof |
|---|---|---|
| deployments | project_id FK | membership via project_id |
| incidents | project_id FK | membership via project_id |
| incident_comments / timeline | incident_id → project_id | membership |
| rollback_operations | project_id FK | membership |
| monitoring_alerts | project_id FK | membership |
| notifications | user_id FK | user_id == caller |
| plugin_installations | installed_by | installed_by == caller |
| automation_rules / executions / scheduled_tasks | project_id + owner_id | owner_id == caller |
| comments (project/deployment/rollback) | *-> project_id | membership + author-only edits |
| attachments | user_id + parent | uploader or membership |
| entity_activities | entity_type/entity_id -> project | membership |
| share_links | created_by | created_by == caller |

## 8. Authorization matrix (endpoint-level)

~60 authenticated endpoints audited. 41 SAFE, 3 UNSCOPED, rest CHECK_ME (see §11).

## 9. Database relationship diagram

```
auth.users
 ├── projects(owner_id) → deployments → rollback_operations(s), incidents(s), monitoring_alerts,
 ├── team_members(user_id, project_id) [1:1 user-project]
 ├── plugin_installations(installed_by)
 ├── notifications(user_id, project_id, incident_id, deployment_id)
 ├── audit_logs(user_id, project_id)
 ├── automation_rules(owner_id, project_id) → automation_executions(rule_id)
 ├── scheduled_tasks(owner_id, project_id)
 ├── attachments(user_id)
 ├── share_links(created_by)
 └── preferences table[s] (user_id PK)
```

## 10. RLS audit

RLS is **enabled** on every app table. Policies are uniformly **owner-centric**
(`owner_id = auth.uid()` or `project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())`),
extended only for incidents + security audit logs to accepted team members.

1. The **backend uses the service-role key and bypasses RLS by design** (`database.py:29-32`).
   RLS is therefore a latent defense for direct-JWT access, not the live boundary.
2. For a direct-JWT holder (e.g. compromised user JWT hitting PostgREST), RLS is
   **fail-closed** for everything except the owner's own rows and team-member incidents —
   acceptable.
3. Gaps (not exploitable given the app never uses a Supabase client):
   - no `status='accepted'` filter in the team-member policies of several sub-resources;
   - `plugin_installations`/`share_links` etc. are owner-only at the DB (viewer/admin DB
     access denied) — inconsistent with backend RBAC but fail-closed.
4. **Do not weaken any policy.** No remediation needed to make endpoints work; the
   re-implemented server-side RBAC is the live security boundary (documented decision).

## 11. API authorization audit — findings

### UNSCOPED / cross-tenant (exploitable)

- **FIND-A (High) `POST /monitoring/events`** (also mounted at `/events`, `/api/events`,
  `main.py:128-129`). Anonymous branch (`monitoring.py:148-152`) writes attacker-chosen alert
  rows into **any project by UUID** (`supabase.table("monitoring_alerts").insert(...)`,
  `monitoring.py:169`). Anyone who knows a project UUID (UUIDs leak via share links, invites,
  notifications, mentions) can inject fake `critical/firing` alerts into another team's
  monitoring dashboard; combined with a globally-visible `alert.fired` automation rule this
  can also trigger cross-tenant automation actions.
- **FIND-B (High) `POST /upload`** (`upload.py:114-142`): with `comment_id` absent/empty the
  project-membership guard is skipped entirely; files land in a **public** storage bucket
  (`upload.py:161`, `/storage/v1/object/public/attachments/...`) readable by anyone with the
  URL, and metadata rows are free. No access control at the storage layer.
- **FIND-C (High) `POST /plugins/test`** (`plugins.py:316,362,400`): fetches arbitrary
  client-supplied `base_url`/vercel selectors with **no SSRF guard**; response status and
  first ~100 chars echoed. Authenticated outbound SSRF.

### CHECK_ME — correctness/leak (needs the service fix)

- **FIND-D (High) rollback target not project-verified** — `rollback.py:31-34` passes
  `target_deployment_id` through; `rollback_service.py:32-45` looks up the deployment by id /
  `external_event_id` / `version` **globally, without checking `deployment.project_id ==
  project_id`**. A Project A member can reference Project B deployments (cross-tenant
  reference disclosure + provider call with the wrong external id). Resolution also creates a
  fake deployment row if unmatched.
- **FIND-E (High) SSRF bypass via redirects / DNS rebinding** — `service_prober.py` guards the
  *initial* target (`_assert_safe_target`), then every httpx call uses
  `follow_redirects=True` (`service_prober.py:152,164,197,225,250,272,294,314,335`) and httpx
  re-resolves DNS at request time (TOCTOU). A public URL that 302s to `169.254.169.254`,
  `127.0.0.1`, or an internal service is fetched for the attacker (response text echoed into
  alerts).
- **FIND-F (Medium) automation webhook action is arbitrary-POST SSRF**
  (`automation_engine.py:160-163`): no `_assert_safe_target` on `action["url"]`.

### Medium

- **FIND-G WebSocket audience includes un-accepted members**
  (`websocket_service.py:44-52`): `team_members` broadcast queries have no
  `status='accepted'` filter → `invited`/`declined` users receive project events.
- **FIND-H Automation fires after membership is revoked** — project-scoped rules keep firing
  once the owner leaves the project; global rules bound to ownership still fire on old
  owned projects (inconsistent revocation).
- **FIND-I Automation `notify` targets arbitrary users** (`automation_engine.py:116,
  122-133`) — a rule owner can spam any `target_user_id` cross-tenant.
- **FIND-J Share passwords hashed with unsalted SHA-256** (`sharing.py:76,128`) — weak hash,
  plus password sent via query string (logged).
- **FIND-K Full user directory enumeration** — `team.py:541-565` (`/team/search`) and
  `team.py:170-172` (`admin.list_users()`) page the entire auth.user DB and filter in Python;
  any authenticated user can enumerate every user's email/name (also O(N) per request).
- **FIND-L Rollback poll uses a globally-unscoped provider token**
  (`rollback_service.py:179,206`): `.eq("plugin_id","vercel").limit(1)` — may use another
  user's token for status polling.

### Low / hardening

- **FIND-M** `POST /monitoring/sync` (`monitoring.py:77-84`) — any authenticated user can
  trigger a global multi-plugin sync (resource abuse).
- **FIND-N** `audit.py:23` `select("*")` returns all audit columns (additive risk if secrets
  are ever added).
- **FIND-O** `incidents.py:193` `ignore_incident` accepts an untyped `body: dict`.
- **FIND-P** `POST /ai/analyze` (`ai.py:18-19,47`) accepts fully client-controlled context
  with no `incident_id` validation and no rate limit (cost/abuse + prompt-injection surface).

## 15–16. Integration credential isolation

- Provider tokens are stored raw (plaintext) in `plugin_installations.api_key_encrypted`
  (misleading name — no encryption), read only server-side, masked in all API responses.
- Writes of stale per-user Vercel/Netlify keys are scoped to `installed_by == user` at
  read sites; plugin sync iterates all connected plugins with their owners' own keys.
- **Credentials never shipped client-side** (no `VITE_*` secret, no `localStorage` seeding,
  verified in build artifacts).

## 17–20. WebSocket / background / notification / sharing

- **WebSocket auth**: token resolved to user id server-side (`main.py:150-203`); per-user
  connection registry; no client-subscribed channels — leaks only via FIND-G.
- **Scheduler**: tasks execute sibling context loaded with `project_id`+`owner_id`; no
  cross-tenant data path found; **automation engine** global rules are correctly bounded to
  the owner's owned projects (`automation_engine.py:237-255`) but see FIND-H/I/F.
- **Notifications** are user-scoped (`.`eq("user_id", caller)`) — safe.
- **Sharing**: 32-byte url-safe tokens, expiry + revocation checked; creation is owner-only.

## 21–24. Severity summary

- **High:** FIND-A (anonymous cross-tenant alert injection), FIND-B (public bucket +
  unscoped upload), FIND-C (plugins SSRF), FIND-D (rollback cross-project refs), FIND-E
  (redirect/DNS-rebinding SSRF).
- **Medium:** FIND-F (automation webhook SSRF), FIND-G (WS audience), FIND-H (rule fires
  post-revocation), FIND-I (arbitrary notify target), FIND-J (weak share password hash),
  FIND-K (user directory enumeration), FIND-L (unscoped poll token).
- **Low:** FIND-M (sync trigger abuse), FIND-N (audit `select *`), FIND-O (untyped body),
  FIND-P (AI analyze unvalidated + unlimited).

## 25. Changes implemented (post-audit)

All High + Medium findings addressed incrementally; each fix verified with
`python -m compileall`, `import main` + TestClient `/health`, targeted guard tests,
and `npm run build`. No RLS/schema change; no credential rotation.

| Finding | Fix |
|---|---|
| FIND-A (High) anonymous `/monitoring/events` injection | Anonymous intake requires `X-Event-Intake-Secret` == `settings.EVENT_INTAKE_TOKEN` (new env, fail-closed if unset). `monitoring.py` |
| FIND-B (High) unscoped upload + public bucket | Upload now fail-closed: requires existing `comment_id` + project membership. Residual Medium (public bucket) → private-bucket + signed-URL migration deferred (documented). `upload.py` |
| FIND-C (High) `/plugins/test` SSRF | `_assert_safe_target` guard + `follow_redirects=False` for all user-controlled targets. `plugins.py` |
| FIND-D (High) rollback cross-project deployment ref | `execute_rollback` verifies resolved deployment `project_id == caller project_id` before provider call/row write. `rollback_service.py` |
| FIND-E (High) prober redirect/DNS-rebinding SSRF | New `_safe_get` re-asserts each redirect hop; all probe GETs use it. `service_prober.py` |
| FIND-F (Med) automation webhook SSRF | Webhook URL must pass `_assert_safe_target`; `follow_redirects=False`. `automation_engine.py` |
| FIND-G (Med) WS audience includes invited/declined | `team_members.status = accepted` filter. `websocket_service.py` |
| FIND-H (Med) rules fire after membership revoked | Fire-time re-check of rule-owner access (owner or accepted member). `automation_engine.py` |
| FIND-I (Med) arbitrary notify targets | `notify` restricted to project owner/accepted members (skip otherwise). `automation_engine.py` |
| FIND-J (Med) unsalted SHA-256 share passwords | PBKDF2-HMAC-SHA256 (600k iter, per-link salt), constant-time verify, legacy auto-upgrade. `sharing.py` |
| FIND-K (Med) user-directory enumeration | Paginated `list_users` with 1000-user cap + 30/min rate limit on `/team/search`. `team.py` |
| FIND-L (Med) unscoped poll token | Poll token lookup scoped to `installed_by = project.owner_id`. `rollback_service.py` |

## 26. Remaining risks

- RLS remains owner-centric and bypassed by design (service-role data layer). If the app ever
  ships a Supabase client to the browser, an owner-based RLS rework is mandatory.
- Attachments bucket stays public-by-default; paths are unguessable but URL-leak = readable.
  Private-bucket + signed-URL read path is the recommended follow-up.
- Sync supabase client blocks the asyncio loop (perf, not isolation).
- 10s project-membership cache TTL — revocation takes effect ≤10s.
- Rate limiting is per-process (single replica; shared limiter needed for multi-replica).
- Low findings not yet addressed: audit `select("*")` (FIND-N), untyped incident body
  (FIND-O), unlimited AI analyze (FIND-P), `/monitoring/sync` global trigger (FIND-M).