# Graph Report - major  (2026-09-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1128 nodes · 2197 edges · 78 communities (69 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 37 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f48e120f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- incidents.py
- supabase_schema_additions.sql
- PlatformContext.tsx
- auth.py
- database.py
- SecurityTriageService
- react
- api.ts
- automation.py
- AutomationHub.tsx
- broadcast_to_user
- is_valid_uuid
- App.tsx
- get_user_project_ids
- Incidents.tsx
- plugins.py
- plugin_sync.py
- monitoring.py
- PipelineCenter.tsx
- upload_file
- compilerOptions
- service_prober.py
- scheduler_service.py
- settings.py
- add_team_member
- compilerOptions
- create_share_link
- Dashboard.tsx
- AISecurityTriageService
- routers/ai.py
- package.json
- routers/rollback.py
- add_comment
- _caller_role
- devDependencies
- send_email
- Monitoring.tsx
- Settings.tsx
- QueryProvider.tsx
- _table_for
- grafana_webhook
- Header.tsx
- get_supabase
- _assert_owns
- scheduler_status
- _iter_user_pages
- github_security_webhook
- dependencies
- Integrations.tsx
- AutomationHub
- issues.ts
- serve_spa
- .oxlintrc.json
- scripts
- PipelineStageBar.tsx
- _resolve_ws_user
- rate_limit.py
- mark_all_read
- _insert_team_invite_notification
- deployment.py
- notification.py
- netlify_service.py
- vercel_service.py
- vite.config.ts
- Settings
- security_headers
- list_audit_logs
- list_notifications
- delete_task
- revoke_share_link
- opencode.json
- graphify.js
- tsconfig.json
- idp-backend

## God Nodes (most connected - your core abstractions)
1. `usePlatform()` - 52 edges
2. `get_user_project_ids()` - 38 edges
3. `react` - 37 edges
4. `isApiAvailable()` - 29 edges
5. `lucide-react` - 28 edges
6. `get_current_user()` - 25 edges
7. `is_valid_uuid()` - 21 edges
8. `broadcast_to_user()` - 19 edges
9. `SecurityTriageService` - 18 edges
10. `compilerOptions` - 18 edges

## Surprising Connections (you probably didn't know these)
- `ingest_event()` --indirect_call--> `create_from_alert()`  [INFERRED]
  backend/routers/monitoring.py → backend/services/incident_service.py
- `grafana_webhook()` --indirect_call--> `create_from_alert()`  [INFERRED]
  backend/webhooks/grafana_webhook.py → backend/services/incident_service.py
- `CreateProjectWizard()` --calls--> `usePlatform()`  [EXTRACTED]
  src/pages/CreateProjectWizard.tsx → src/context/PlatformContext.tsx
- `_assert_endpoint()` --calls--> `_assert_safe_target()`  [EXTRACTED]
  backend/routers/plugins.py → backend/services/service_prober.py
- `trigger_monitoring_sync()` --indirect_call--> `sync_all_plugins()`  [INFERRED]
  backend/routers/monitoring.py → backend/background/plugin_sync.py

## Import Cycles
- None detected.

## Communities (78 total, 5 thin omitted)

### Community 0 - "incidents.py"
Cohesion: 0.07
Nodes (47): CommentCreate, FeedbackUpdate, IncidentCreate, IncidentResponse, IncidentUpdate, BaseModel, Pydantic models for incident resources., ProjectCreate (+39 more)

### Community 1 - "supabase_schema_additions.sql"
Cohesion: 0.10
Nodes (42): idx_incidents_service_id, idx_incidents_source, idx_projects_service_name, idx_security_audit_created, idx_security_audit_incident, idx_security_audit_project, idx_security_audit_service, security_incident_audit_logs (+34 more)

### Community 2 - "PlatformContext.tsx"
Cohesion: 0.11
Nodes (41): CreateProjectWizard, PlatformContext, PlatformContextProps, PlatformProvider(), storageGet(), storageRemove(), storageSet(), aiExplanations (+33 more)

### Community 3 - "auth.py"
Cohesion: 0.09
Nodes (42): get_auth_client(), Return a FRESH Supabase client for authentication operations. A new client is…, GithubLoginRequest, LoginRequest, BaseModel, Pydantic models for authentication and user data., Request body for POST /auth/login., Request body for POST /auth/refresh. (+34 more)

### Community 4 - "database.py"
Cohesion: 0.10
Nodes (26): Application configuration using pydantic-settings. All settings are loaded from…, Supabase client singleton — lazy initialization. The client is created on first…, _cached_identity(), get_current_user(), get_optional_user(), FastAPI dependency functions shared across routers., Extract and validate the JWT from the Authorization header. Cached-for-30s per…, Optionally extract user if Bearer token is provided, otherwise return None.… (+18 more)

### Community 5 - "SecurityTriageService"
Cohesion: 0.09
Nodes (31): _format_incident(), get_incident_detail(), get_security_incidents(), get_security_metrics(), ignore_incident(), Any, get, post (+23 more)

### Community 6 - "react"
Cohesion: 0.11
Nodes (30): lucide-react, react, ACTION_ICONS, ActivityFeed(), ActivityFeedProps, ActivityItem, DEFAULT_ACTION, EntityActivityType (+22 more)

### Community 7 - "api.ts"
Cohesion: 0.06
Nodes (35): ShareView, DeploymentView(), IncidentView(), parseLocation(), ProjectView(), severityColor(), ShareView(), State (+27 more)

### Community 8 - "automation.py"
Cohesion: 0.08
Nodes (34): AutomationRuleIn, AutomationRuleUpdate, create_rule(), delete_rule(), list_executions(), list_rules(), list_triggers(), BaseModel (+26 more)

### Community 9 - "AutomationHub.tsx"
Cohesion: 0.07
Nodes (23): ACTION_META, ACTION_TYPES, CONDITION_FIELDS, CONDITION_OPS, PRESET_CRONS, RuleAction, RuleCondition, RuleForm (+15 more)

### Community 10 - "broadcast_to_user"
Cohesion: 0.11
Nodes (27): broadcast_to_user(), Push a JSON event to a connected user (no-op if user is offline)., evaluate_event(), Run all matching enabled rules for an event. Returns execution results., Send notification email when a new incident is created., send_incident_created(), create_from_alert(), create_from_deployment() (+19 more)

### Community 11 - "is_valid_uuid"
Cohesion: 0.11
Nodes (26): get_deployment(), list_deployments(), get, Deployments router — list and sync., Return deployments belonging to the authenticated user's projects., Fetch deployment by internal UUID or external_event_id., Fetch latest deployments from provider or live endpoint and upsert them into…, sync_deployments() (+18 more)

### Community 12 - "App.tsx"
Cohesion: 0.12
Nodes (20): AIAssistant, AppContent(), DeploymentDetails, Deployments, Notifications, PluginConfig, ProjectDetails, Projects (+12 more)

### Community 13 - "get_user_project_ids"
Cohesion: 0.09
Nodes (25): get_user_project_ids(), Return all project IDs accessible to user_id. A user can access a project when…, get_project(), list_projects(), get, Return all projects accessible to the authenticated user. A project is…, Fetch a single project — 404 if not found or the user lacks access. Access is…, create_task() (+17 more)

### Community 14 - "Incidents.tsx"
Cohesion: 0.12
Nodes (25): Incidents, mockArgoCDStatus, alertSourceColor(), alertSourceLabel(), SOURCE_COLORS, SOURCE_LABELS, DeploymentDetails(), ActivityFilter (+17 more)

### Community 15 - "plugins.py"
Cohesion: 0.15
Nodes (22): create_plugin(), delete_plugin(), _format_plugin_record(), _get_user_id(), list_plugins(), PluginConfigUpdate, PluginTestRequest, Any (+14 more)

### Community 16 - "plugin_sync.py"
Cohesion: 0.11
Nodes (17): Background task that syncs monitoring plugins using per-user credentials stored…, Fetch all connected plugin installations from Supabase. Each row stores the…, sync_all_plugins(), fetch_monitors(), Datadog monitor sync service., Fetch monitors from Datadog and map them to the internal monitoring_alerts…, fetch_alerts(), Grafana alert sync service. (+9 more)

### Community 17 - "monitoring.py"
Cohesion: 0.15
Nodes (21): EventIntakeRequest, handle_probe(), handle_trigger_test(), ingest_event(), list_alerts(), BackgroundTasks, BaseModel, get (+13 more)

### Community 18 - "PipelineCenter.tsx"
Cohesion: 0.13
Nodes (15): Automation, timeAgo(), BuildDrillDown(), BuildRow(), DEFAULT_STAGES, DeployStage, Elapsed(), ENV_ORDER (+7 more)

### Community 19 - "upload_file"
Cohesion: 0.10
Nodes (20): _assert_attachment_access(), _attachment_project_id(), delete_attachment(), get_attachment(), _looks_text(), delete, get, post (+12 more)

### Community 20 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 21 - "service_prober.py"
Cohesion: 0.17
Nodes (18): AsyncClient, _assert_safe_target(), _get_project_target_url(), probe_project(), Any, Service prober for end-to-end testing application monitoring. Probes deployed…, Find a project by UUID or name. Returns None if no project matches. Callers…, Determine the base URL for probing a project. (+10 more)

### Community 22 - "scheduler_service.py"
Cohesion: 0.14
Nodes (16): Manually trigger a scheduled task., run_task_now(), Execute a single action. Returns {'status': ..., 'detail': ...}., _run_action(), create_notification(), Notification creation and WebSocket broadcast helper., Persist a notification row and push it to the user's WebSocket (if connected)., _cron_parse() (+8 more)

### Community 23 - "settings.py"
Cohesion: 0.16
Nodes (16): get_notification_preferences(), get_security_config(), get_user_preferences(), NotificationPreferences, BaseModel, get, post, Settings router — notification preferences and user preferences. (+8 more)

### Community 24 - "add_team_member"
Cohesion: 0.12
Nodes (16): accept_team_invite(), add_team_member(), decline_team_invite(), post, Add a team member to a project. Behaviour: - If an Aether account exists for…, Accept a pending team invite. The invite token is validated against the stored…, Decline a pending team invite., create_from_security_triage() (+8 more)

### Community 25 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 26 - "create_share_link"
Cohesion: 0.13
Nodes (16): create_share_link(), _entity_owner(), _hash_share_password(), my_share_links(), public_view(), BaseModel, get, post (+8 more)

### Community 27 - "Dashboard.tsx"
Cohesion: 0.17
Nodes (14): recharts, Dashboard, nextCronRun(), useDragReorder(), CustomizeDialog(), Dashboard(), DEFAULT_ORDER, loadLayout() (+6 more)

### Community 28 - "AISecurityTriageService"
Cohesion: 0.19
Nodes (9): AISecurityTriageService, _main(), Any, Aether AI Security Triage Script. Runs in the GitHub Actions security triage…, Analyse ``scan_path`` Trivy JSON; return the triage report + mined fields., Deterministic heuristic used when the LLM is unavailable., POST the triage report to the Aether security webhook (HMAC-signed)., Analyse Trivy findings with an OpenAI-compatible model. (+1 more)

### Community 29 - "routers/ai.py"
Cohesion: 0.21
Nodes (12): AnalysisResponse, AnalyzeRequest, BaseModel, Pydantic models for AI analysis resources., analyze(), _assert_incident_access(), get_analysis(), get (+4 more)

### Community 30 - "package.json"
Cohesion: 0.13
Nodes (14): name, private, type, version, autoprefixer, concurrently, postcss, react-dom (+6 more)

### Community 31 - "routers/rollback.py"
Cohesion: 0.20
Nodes (12): BaseModel, Pydantic models for rollback resources., RollbackRequest, RollbackResponse, get_rollback(), BackgroundTasks, get, post (+4 more)

### Community 32 - "add_comment"
Cohesion: 0.15
Nodes (13): add_comment(), CommentCreate, CommentUpdate, edit_comment(), _extract_mentions(), _notify_mentioned(), BaseModel, patch (+5 more)

### Community 33 - "_caller_role"
Cohesion: 0.18
Nodes (11): _caller_role(), BaseModel, delete, patch, Update a team member's role., Remove a team member from a project., Return the caller's highest role on the project (owner > admin > developer >…, remove_team_member() (+3 more)

### Community 34 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, autoprefixer, concurrently, postcss, tailwindcss, @types/node, @types/react, @types/react-dom (+3 more)

### Community 35 - "send_email"
Cohesion: 0.24
Nodes (9): Email notification service using Resend (free tier: 3,000/month). Falls back to…, Send notification email when a rollback completes., Send a transactional email via Resend. Returns True if sent, False otherwise., Send a team invitation email with accept/decline links., send_email(), send_rollback_completed(), send_team_invite(), poll_rollback_status() (+1 more)

### Community 36 - "Monitoring.tsx"
Cohesion: 0.29
Nodes (9): Monitoring, Monitoring(), sentryLevelColor(), severityColor(), sourceIcon(), statusColor(), AlertSeverity, AlertSource (+1 more)

### Community 37 - "Settings.tsx"
Cohesion: 0.22
Nodes (7): Settings, ALL_PAGES, CardId, PAGE_SECTIONS, Settings(), TeamSectionProps, ProjectRole

### Community 38 - "QueryProvider.tsx"
Cohesion: 0.33
Nodes (6): @tanstack/react-query, App(), isServerError(), queryClient, QueryProvider(), QueryProviderProps

### Community 39 - "_table_for"
Cohesion: 0.25
Nodes (8): delete_comment(), list_comments(), delete, get, Delete a comment (author only)., Return (fkey_col, table_name) if the user is a member of the entity's project,…, List comments for an entity., _table_for()

### Community 40 - "grafana_webhook"
Cohesion: 0.25
Nodes (8): grafana_webhook(), Any, BackgroundTasks, post, Request, Resolve an internal project ID using exact project identifiers. Matches case-…, Receive and process Grafana / Alertmanager alert webhooks., _resolve_project_id()

### Community 41 - "Header.tsx"
Cohesion: 0.25
Nodes (6): Header(), PageEntry, PAGES, SearchResult, TYPE_ICONS, TYPE_LABELS

### Community 42 - "get_supabase"
Cohesion: 0.33
Nodes (5): get_supabase(), _LazyClient, Return the shared Supabase client, creating it on first call. This client is…, Thin wrapper that forwards all attribute access to the real Supabase client., Client

### Community 43 - "_assert_owns"
Cohesion: 0.33
Nodes (7): activity_count(), _assert_owns(), get_activity(), get, Raise 400/404 unless the entity belongs to a project the user is a member of., Return a paginated activity feed for an entity., Return the number of activity entries for an entity.

### Community 44 - "scheduler_status"
Cohesion: 0.29
Nodes (7): list_tasks(), get, Return the in-process APScheduler status., List scheduled tasks owned by the current user., scheduler_status(), get_scheduler_status(), Return an informational status of the in-process scheduler.

### Community 45 - "_iter_user_pages"
Cohesion: 0.29
Nodes (7): get_pending_invites(), _iter_user_pages(), get, Yield User objects page-by-page from the Auth Admin API (early exit on short…, Return all pending invites for the authenticated user's email., Search users by email or name for @mention autocomplete. Uses the Auth Admin…, search_users()

### Community 46 - "github_security_webhook"
Cohesion: 0.29
Nodes (7): github_security_webhook(), BackgroundTasks, post, Request, Verify the GitHub ``X-Hub-Signature-256`` HMAC-SHA256 signature., Create service-scoped security incidents from a triage payload. The request…, _verify_security_webhook()

### Community 47 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, lucide-react, react, react-dom, recharts, @tanstack/react-query, zustand

### Community 48 - "Integrations.tsx"
Cohesion: 0.33
Nodes (6): Integrations, CATEGORIES, Integrations(), statusBadge(), PluginCategory, PluginStatus

### Community 49 - "AutomationHub"
Cohesion: 0.29
Nodes (5): ScheduledTasks, AutomationHub(), autoref(), emptyRuleForm(), emptyTaskForm()

### Community 50 - "issues.ts"
Cohesion: 0.29
Nodes (6): CreateIssuePayload, Issue, IssuePriority, IssueStatus, IssueType, UpdateIssueStatusPayload

### Community 51 - "serve_spa"
Cohesion: 0.33
Nodes (6): health_check(), get, Liveness / readiness probe — returns 200 when the process is up., Catch-all: serve index.html for any path the React router handles., serve_spa(), FileResponse

### Community 52 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 53 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, backend, build, dev, frontend, preview

### Community 54 - "PipelineStageBar.tsx"
Cohesion: 0.47
Nodes (5): fmtStageDur(), PipelineStageBar(), STAGE_BOX, stageBoxIcon(), StageStatus

### Community 55 - "_resolve_ws_user"
Cohesion: 0.40
Nodes (5): Validate the JWT passed as a query param and return the user_id (or None). A…, Per-user WebSocket for real-time push events. Requires valid JWT., _resolve_ws_user(), websocket_endpoint(), websocket

### Community 56 - "rate_limit.py"
Cohesion: 0.40
Nodes (3): rate_limit(), Lightweight in-process rate limiting for high-risk endpoints. Fixed-window…, Return a FastAPI dependency enforcing a fixed-window rate per client+route.

### Community 57 - "mark_all_read"
Cohesion: 0.40
Nodes (5): mark_all_read(), mark_read(), patch, Mark a single notification as read., Mark all of the authenticated user's notifications as read.

### Community 58 - "_insert_team_invite_notification"
Cohesion: 0.40
Nodes (5): _insert_team_invite_notification(), _is_schema_cache_error(), Insert an in-platform notification, retrying briefly across schema reloads. The…, Return True if the exception indicates a stale PostgREST schema cache.…, Exception

### Community 59 - "deployment.py"
Cohesion: 0.50
Nodes (3): DeploymentResponse, BaseModel, Pydantic models for deployment resources.

### Community 60 - "notification.py"
Cohesion: 0.50
Nodes (3): NotificationResponse, BaseModel, Pydantic models for notification resources.

### Community 61 - "netlify_service.py"
Cohesion: 0.50
Nodes (3): fetch_deployments(), Netlify deployment sync service., Fetch recent deploys for a Netlify site and map them to the internal schema.

### Community 62 - "vercel_service.py"
Cohesion: 0.50
Nodes (3): fetch_deployments(), Vercel deployment sync service., Fetch recent deployments for a Vercel project and map them to the internal…

### Community 64 - "Settings"
Cohesion: 0.67
Nodes (3): Central settings object — fields map 1-to-1 with environment variables., Settings, BaseSettings

### Community 65 - "security_headers"
Cohesion: 0.67
Nodes (3): Request, security_headers(), middleware

### Community 66 - "list_audit_logs"
Cohesion: 0.67
Nodes (3): list_audit_logs(), get, Return paginated audit logs for the authenticated user.

### Community 67 - "list_notifications"
Cohesion: 0.67
Nodes (3): list_notifications(), get, Return all notifications for the authenticated user, newest first.

### Community 68 - "delete_task"
Cohesion: 0.67
Nodes (3): delete_task(), delete, Delete a scheduled task.

### Community 69 - "revoke_share_link"
Cohesion: 0.67
Nodes (3): delete, Revoke a share link (creator only)., revoke_share_link()

## Knowledge Gaps
- **172 isolated node(s):** `ActivityFilter`, `DetailTab`, `ListTab`, `RemediationStep`, `ProjectTab` (+167 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 513 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get_user_project_ids()` connect `get_user_project_ids` to `incidents.py`, `database.py`, `SecurityTriageService`, `_table_for`, `automation.py`, `_assert_owns`, `is_valid_uuid`, `plugins.py`, `monitoring.py`, `upload_file`, `routers/ai.py`, `routers/rollback.py`?**
  _High betweenness centrality (0.055) - this node is a cross-community bridge._
- **Why does `get_current_user()` connect `database.py` to `incidents.py`, `auth.py`, `SecurityTriageService`, `automation.py`, `is_valid_uuid`, `get_user_project_ids`, `plugins.py`, `monitoring.py`, `settings.py`, `routers/ai.py`, `routers/rollback.py`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Why does `react` connect `react` to `PlatformContext.tsx`, `Monitoring.tsx`, `Settings.tsx`, `QueryProvider.tsx`, `api.ts`, `Header.tsx`, `AutomationHub.tsx`, `App.tsx`, `Incidents.tsx`, `Integrations.tsx`, `AutomationHub`, `PipelineCenter.tsx`, `PipelineStageBar.tsx`, `Dashboard.tsx`, `package.json`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `ActivityFilter`, `DetailTab`, `ListTab` to the rest of the system?**
  _172 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `incidents.py` be split into smaller, more focused modules?**
  _Cohesion score 0.06612244897959184 - nodes in this community are weakly interconnected._
- **Should `supabase_schema_additions.sql` be split into smaller, more focused modules?**
  _Cohesion score 0.09696969696969697 - nodes in this community are weakly interconnected._
- **Should `PlatformContext.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.10505050505050505 - nodes in this community are weakly interconnected._