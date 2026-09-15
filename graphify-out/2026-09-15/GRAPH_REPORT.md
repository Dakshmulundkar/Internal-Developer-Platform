# Graph Report - major  (2026-09-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1084 nodes · 2102 edges · 79 communities (70 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 37 edges (avg confidence: 0.91)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `f48e120f`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- incidents.py
- App.tsx
- auth.py
- database.py
- PlatformContext.tsx
- SecurityTriageService
- api.ts
- broadcast_to_user
- isApiAvailable
- AutomationHub.tsx
- add_team_member
- monitoring.py
- plugin_sync.py
- comments.py
- plugins.py
- ProjectDetails.tsx
- upload_file
- compilerOptions
- PipelineCenter.tsx
- service_prober.py
- deployments.py
- get_user_project_ids
- scheduler_service.py
- compilerOptions
- routers/ai.py
- create_share_link
- AISecurityTriageService
- broadcast_to_project
- package.json
- Incidents.tsx
- start_rollback
- automation.py
- automation_engine.py
- Dashboard.tsx
- devDependencies
- Monitoring.tsx
- team.py
- ai_service.py
- send_email
- Settings.tsx
- QueryProvider.tsx
- save_notification_preferences
- is_valid_uuid
- grafana_webhook
- AutomationHub
- get_supabase
- _assert_owns
- list_executions
- scheduler_status
- get_notification_preferences
- github_security_webhook
- dependencies
- Integrations.tsx
- issues.ts
- serve_spa
- .oxlintrc.json
- scripts
- PipelineStageBar.tsx
- _resolve_ws_user
- mark_all_read
- automation.ts
- notification.py
- netlify_service.py
- vite.config.ts
- Settings
- security_headers
- list_audit_logs
- delete_rule
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
- `trigger_monitoring_sync()` --indirect_call--> `sync_all_plugins()`  [INFERRED]
  backend/routers/monitoring.py → backend/background/plugin_sync.py
- `github_security_webhook()` --indirect_call--> `create_from_security_triage()`  [INFERRED]
  backend/webhooks/github_security_webhook.py → backend/services/incident_service.py
- `grafana_webhook()` --indirect_call--> `create_from_alert()`  [INFERRED]
  backend/webhooks/grafana_webhook.py → backend/services/incident_service.py
- `add_comment()` --uses--> `CommentCreate`  [INFERRED]
  backend/routers/incidents.py → backend/models/incident.py

## Import Cycles
- None detected.

## Communities (79 total, 5 thin omitted)

### Community 0 - "incidents.py"
Cohesion: 0.06
Nodes (53): CommentCreate, FeedbackUpdate, IncidentCreate, IncidentResponse, IncidentUpdate, BaseModel, Pydantic models for incident resources., ProjectCreate (+45 more)

### Community 1 - "App.tsx"
Cohesion: 0.09
Nodes (30): lucide-react, react, AppContent(), Automation, CreateProjectWizard, Deployments, Notifications, PluginConfig (+22 more)

### Community 2 - "auth.py"
Cohesion: 0.09
Nodes (42): get_auth_client(), Return a FRESH Supabase client for authentication operations. A new client is…, GithubLoginRequest, LoginRequest, BaseModel, Pydantic models for authentication and user data., Request body for POST /auth/login., Request body for POST /auth/refresh. (+34 more)

### Community 3 - "database.py"
Cohesion: 0.10
Nodes (26): Application configuration using pydantic-settings. All settings are loaded from…, Supabase client singleton — lazy initialization. The client is created on first…, _cached_identity(), get_current_user(), get_optional_user(), FastAPI dependency functions shared across routers., Extract and validate the JWT from the Authorization header. Cached-for-30s per…, Optionally extract user if Bearer token is provided, otherwise return None.… (+18 more)

### Community 4 - "PlatformContext.tsx"
Cohesion: 0.12
Nodes (38): PlatformContext, PlatformContextProps, PlatformProvider(), storageGet(), storageRemove(), storageSet(), currentUser, initialAuditLogs (+30 more)

### Community 5 - "SecurityTriageService"
Cohesion: 0.10
Nodes (30): _format_incident(), get_incident_detail(), get_security_incidents(), get_security_metrics(), ignore_incident(), Any, get, post (+22 more)

### Community 6 - "api.ts"
Cohesion: 0.06
Nodes (35): ShareView, DeploymentView(), IncidentView(), parseLocation(), ProjectView(), severityColor(), ShareView(), State (+27 more)

### Community 7 - "broadcast_to_user"
Cohesion: 0.12
Nodes (26): broadcast_to_user(), Push a JSON event to a connected user (no-op if user is offline)., evaluate_event(), Run all matching enabled rules for an event. Returns execution results., create_from_alert(), create_from_deployment(), Incident creation helpers called by webhooks and background tasks., Auto-create an incident when a deployment fails. (+18 more)

### Community 8 - "isApiAvailable"
Cohesion: 0.11
Nodes (24): AIAssistant, RollbackRecovery, ACTION_ICONS, ActivityFeed(), ActivityFeedProps, ActivityItem, DEFAULT_ACTION, EntityActivityType (+16 more)

### Community 9 - "AutomationHub.tsx"
Cohesion: 0.09
Nodes (19): ACTION_META, ACTION_TYPES, CONDITION_FIELDS, CONDITION_OPS, PRESET_CRONS, RuleAction, RuleCondition, RuleForm (+11 more)

### Community 10 - "add_team_member"
Cohesion: 0.08
Nodes (25): add_team_member(), _caller_role(), get_pending_invites(), _insert_team_invite_notification(), _is_schema_cache_error(), _iter_user_pages(), BaseModel, delete (+17 more)

### Community 11 - "monitoring.py"
Cohesion: 0.13
Nodes (23): EventIntakeRequest, handle_probe(), handle_trigger_test(), ingest_event(), list_alerts(), BackgroundTasks, BaseModel, get (+15 more)

### Community 12 - "plugin_sync.py"
Cohesion: 0.11
Nodes (17): Background task that syncs monitoring plugins using per-user credentials stored…, Fetch all connected plugin installations from Supabase. Each row stores the…, sync_all_plugins(), fetch_monitors(), Datadog monitor sync service., Fetch monitors from Datadog and map them to the internal monitoring_alerts…, fetch_alerts(), Grafana alert sync service. (+9 more)

### Community 13 - "comments.py"
Cohesion: 0.12
Nodes (22): add_comment(), CommentCreate, CommentUpdate, delete_comment(), edit_comment(), _extract_mentions(), list_comments(), _notify_mentioned() (+14 more)

### Community 14 - "plugins.py"
Cohesion: 0.16
Nodes (21): create_plugin(), delete_plugin(), _format_plugin_record(), _get_user_id(), list_plugins(), PluginConfigUpdate, PluginTestRequest, Any (+13 more)

### Community 15 - "ProjectDetails.tsx"
Cohesion: 0.17
Nodes (17): DeploymentDetails, ProjectDetails, ShareDialog(), ShareDialogProps, ShareLink, mockArgoCDStatus, alertSourceColor(), alertSourceLabel() (+9 more)

### Community 16 - "upload_file"
Cohesion: 0.10
Nodes (20): _assert_attachment_access(), _attachment_project_id(), delete_attachment(), get_attachment(), _looks_text(), delete, get, post (+12 more)

### Community 17 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowArbitraryExtensions, allowImportingTsExtensions, erasableSyntaxOnly, jsx, lib, module, moduleDetection (+11 more)

### Community 18 - "PipelineCenter.tsx"
Cohesion: 0.15
Nodes (14): timeAgo(), BuildDrillDown(), BuildRow(), DEFAULT_STAGES, DeployStage, Elapsed(), ENV_ORDER, fmtDur() (+6 more)

### Community 19 - "service_prober.py"
Cohesion: 0.15
Nodes (17): AsyncClient, _assert_endpoint(), _assert_safe_target(), _get_project_target_url(), probe_project(), Any, Service prober for end-to-end testing application monitoring. Probes deployed…, Find a project by UUID or name. Returns None if no project matches. Callers… (+9 more)

### Community 20 - "deployments.py"
Cohesion: 0.16
Nodes (15): DeploymentResponse, BaseModel, Pydantic models for deployment resources., get_deployment(), list_deployments(), get, Deployments router — list and sync., Return deployments belonging to the authenticated user's projects. (+7 more)

### Community 21 - "get_user_project_ids"
Cohesion: 0.14
Nodes (15): get_user_project_ids(), Return all project IDs accessible to user_id. A user can access a project when…, create_task(), BaseModel, patch, Create a scheduled task., Update a scheduled task., ScheduledTaskIn (+7 more)

### Community 22 - "scheduler_service.py"
Cohesion: 0.15
Nodes (15): post, Manually trigger a scheduled task., run_task_now(), create_notification(), Notification creation and WebSocket broadcast helper., Persist a notification row and push it to the user's WebSocket (if connected)., _cron_parse(), _job_wrapper() (+7 more)

### Community 23 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowImportingTsExtensions, erasableSyntaxOnly, lib, module, moduleDetection, noEmit, noFallthroughCasesInSwitch (+8 more)

### Community 24 - "routers/ai.py"
Cohesion: 0.20
Nodes (14): AnalysisResponse, AnalyzeRequest, BaseModel, Pydantic models for AI analysis resources., analyze(), _assert_incident_access(), get_analysis(), get (+6 more)

### Community 25 - "create_share_link"
Cohesion: 0.13
Nodes (16): create_share_link(), _entity_owner(), _hash_share_password(), my_share_links(), public_view(), BaseModel, get, post (+8 more)

### Community 26 - "AISecurityTriageService"
Cohesion: 0.19
Nodes (9): AISecurityTriageService, _main(), Any, Aether AI Security Triage Script. Runs in the GitHub Actions security triage…, Analyse ``scan_path`` Trivy JSON; return the triage report + mined fields., Deterministic heuristic used when the LLM is unavailable., POST the triage report to the Aether security webhook (HMAC-signed)., Analyse Trivy findings with an OpenAI-compatible model. (+1 more)

### Community 27 - "broadcast_to_project"
Cohesion: 0.14
Nodes (14): accept_team_invite(), decline_team_invite(), post, Accept a pending team invite. The invite token is validated against the stored…, Decline a pending team invite., create_from_security_triage(), _create_single_triage_incident(), _map_severity() (+6 more)

### Community 28 - "package.json"
Cohesion: 0.13
Nodes (14): name, private, type, version, autoprefixer, concurrently, postcss, react-dom (+6 more)

### Community 29 - "Incidents.tsx"
Cohesion: 0.19
Nodes (13): Incidents, MentionText(), MentionTextProps, ActivityFilter, DetailTab, getRemediationSteps(), Incidents(), ListTab (+5 more)

### Community 30 - "start_rollback"
Cohesion: 0.15
Nodes (13): BaseModel, Pydantic models for rollback resources., RollbackRequest, RollbackResponse, get_rollback(), BackgroundTasks, get, post (+5 more)

### Community 31 - "automation.py"
Cohesion: 0.22
Nodes (13): AutomationRuleIn, AutomationRuleUpdate, create_rule(), BaseModel, patch, post, Automation router — CRUD for automation rules and execution history., Dry-run: evaluate a rule against a sample entity without persisting. (+5 more)

### Community 32 - "automation_engine.py"
Cohesion: 0.19
Nodes (13): _eval_op(), _evaluate_conditions(), _get_field(), _matching_rules(), _project_member_ids(), Automation engine — evaluates automation rules against platform events. Rules…, Return the user id the automated action should notify/email., Return the project owner + accepted team member user ids (RBAC audience). (+5 more)

### Community 33 - "Dashboard.tsx"
Cohesion: 0.19
Nodes (12): recharts, Dashboard, PageType, Dashboard(), DEFAULT_ORDER, loadLayout(), saveLayout(), spanClasses() (+4 more)

### Community 34 - "devDependencies"
Cohesion: 0.18
Nodes (11): devDependencies, autoprefixer, concurrently, postcss, tailwindcss, @types/node, @types/react, @types/react-dom (+3 more)

### Community 35 - "Monitoring.tsx"
Cohesion: 0.25
Nodes (10): Monitoring, initialSentryIssues, Monitoring(), sentryLevelColor(), severityColor(), sourceIcon(), statusColor(), AlertSeverity (+2 more)

### Community 36 - "team.py"
Cohesion: 0.24
Nodes (7): rate_limit(), Lightweight in-process rate limiting for high-risk endpoints. Fixed-window…, Return a FastAPI dependency enforcing a fixed-window rate per client+route., list_team_members(), Team management router — add/remove team members, list team, search users., List team members for the user's projects., _user_project_ids()

### Community 37 - "ai_service.py"
Cohesion: 0.27
Nodes (9): analyze_incident(), cache(), _generate_smart_analysis(), _normalize_response(), AI incident-analysis service — Groq (llama3) primary, OpenAI fallback., Call Groq (with model fallbacks) or OpenAI, falling back seamlessly to smart…, Ensure parsed LLM dict matches the expected AnalysisResponse schema., Upsert an analysis result into ai_analyses. Skipped for non-UUID IDs (seed/demo… (+1 more)

### Community 38 - "send_email"
Cohesion: 0.27
Nodes (9): Email notification service using Resend (free tier: 3,000/month). Falls back to…, Send notification email when a rollback completes., Send a transactional email via Resend. Returns True if sent, False otherwise., Send notification email when a new incident is created., Send a team invitation email with accept/decline links., send_email(), send_incident_created(), send_rollback_completed() (+1 more)

### Community 39 - "Settings.tsx"
Cohesion: 0.22
Nodes (7): Settings, ALL_PAGES, CardId, PAGE_SECTIONS, Settings(), TeamSectionProps, ProjectRole

### Community 40 - "QueryProvider.tsx"
Cohesion: 0.33
Nodes (6): @tanstack/react-query, App(), isServerError(), queryClient, QueryProvider(), QueryProviderProps

### Community 41 - "save_notification_preferences"
Cohesion: 0.29
Nodes (8): NotificationPreferences, BaseModel, post, Save notification preferences for the current user., Save user preferences., save_notification_preferences(), save_user_preferences(), UserPreferences

### Community 42 - "is_valid_uuid"
Cohesion: 0.32
Nodes (6): execute_rollback(), Rollback execution and polling service., Trigger a rollback via the provider API and insert a rollback_operations row.…, is_valid_uuid(), Shared validation helpers used across routers and services., Check if a string is a valid UUID.

### Community 43 - "grafana_webhook"
Cohesion: 0.25
Nodes (8): grafana_webhook(), Any, BackgroundTasks, post, Request, Resolve an internal project ID using exact project identifiers. Matches case-…, Receive and process Grafana / Alertmanager alert webhooks., _resolve_project_id()

### Community 44 - "AutomationHub"
Cohesion: 0.29
Nodes (7): nextCronRun(), useDragReorder(), AutomationHub(), autoref(), emptyRuleForm(), emptyTaskForm(), CustomizeDialog()

### Community 45 - "get_supabase"
Cohesion: 0.33
Nodes (5): get_supabase(), _LazyClient, Return the shared Supabase client, creating it on first call. This client is…, Thin wrapper that forwards all attribute access to the real Supabase client., Client

### Community 46 - "_assert_owns"
Cohesion: 0.33
Nodes (7): activity_count(), _assert_owns(), get_activity(), get, Raise 400/404 unless the entity belongs to a project the user is a member of., Return a paginated activity feed for an entity., Return the number of activity entries for an entity.

### Community 47 - "list_executions"
Cohesion: 0.29
Nodes (7): list_executions(), list_rules(), list_triggers(), get, List recent executions for the user's rules., Return the list of supported trigger types and example conditions., List automation rules owned by the current user.

### Community 48 - "scheduler_status"
Cohesion: 0.29
Nodes (7): list_tasks(), get, Return the in-process APScheduler status., List scheduled tasks owned by the current user., scheduler_status(), get_scheduler_status(), Return an informational status of the in-process scheduler.

### Community 49 - "get_notification_preferences"
Cohesion: 0.29
Nodes (7): get_notification_preferences(), get_security_config(), get_user_preferences(), get, Security triage webhook status (secret configured + target path). The webhook…, Get notification preferences for the current user., Get user preferences (theme, timezone, dashboard layout).

### Community 50 - "github_security_webhook"
Cohesion: 0.29
Nodes (7): github_security_webhook(), BackgroundTasks, post, Request, Verify the GitHub ``X-Hub-Signature-256`` HMAC-SHA256 signature., Create service-scoped security incidents from a triage payload. The request…, _verify_security_webhook()

### Community 51 - "dependencies"
Cohesion: 0.29
Nodes (7): dependencies, lucide-react, react, react-dom, recharts, @tanstack/react-query, zustand

### Community 52 - "Integrations.tsx"
Cohesion: 0.33
Nodes (6): Integrations, CATEGORIES, Integrations(), statusBadge(), PluginCategory, PluginStatus

### Community 53 - "issues.ts"
Cohesion: 0.29
Nodes (6): CreateIssuePayload, Issue, IssuePriority, IssueStatus, IssueType, UpdateIssueStatusPayload

### Community 54 - "serve_spa"
Cohesion: 0.33
Nodes (6): health_check(), get, Liveness / readiness probe — returns 200 when the process is up., Catch-all: serve index.html for any path the React router handles., serve_spa(), FileResponse

### Community 55 - ".oxlintrc.json"
Cohesion: 0.33
Nodes (5): plugins, rules, react/only-export-components, react/rules-of-hooks, $schema

### Community 56 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, backend, build, dev, frontend, preview

### Community 57 - "PipelineStageBar.tsx"
Cohesion: 0.47
Nodes (5): fmtStageDur(), PipelineStageBar(), STAGE_BOX, stageBoxIcon(), StageStatus

### Community 58 - "_resolve_ws_user"
Cohesion: 0.40
Nodes (5): Validate the JWT passed as a query param and return the user_id (or None). A…, Per-user WebSocket for real-time push events. Requires valid JWT., _resolve_ws_user(), websocket_endpoint(), websocket

### Community 59 - "mark_all_read"
Cohesion: 0.40
Nodes (5): mark_all_read(), mark_read(), patch, Mark a single notification as read., Mark all of the authenticated user's notifications as read.

### Community 60 - "automation.ts"
Cohesion: 0.40
Nodes (4): AutomationRule, AutomatonItem, ScheduledTask, TriggerDef

### Community 61 - "notification.py"
Cohesion: 0.50
Nodes (3): NotificationResponse, BaseModel, Pydantic models for notification resources.

### Community 62 - "netlify_service.py"
Cohesion: 0.50
Nodes (3): fetch_deployments(), Netlify deployment sync service., Fetch recent deploys for a Netlify site and map them to the internal schema.

### Community 64 - "Settings"
Cohesion: 0.67
Nodes (3): Central settings object — fields map 1-to-1 with environment variables., Settings, BaseSettings

### Community 65 - "security_headers"
Cohesion: 0.67
Nodes (3): Request, security_headers(), middleware

### Community 66 - "list_audit_logs"
Cohesion: 0.67
Nodes (3): list_audit_logs(), get, Return paginated audit logs for the authenticated user.

### Community 67 - "delete_rule"
Cohesion: 0.67
Nodes (3): delete_rule(), delete, Delete an automation rule.

### Community 68 - "list_notifications"
Cohesion: 0.67
Nodes (3): list_notifications(), get, Return all notifications for the authenticated user, newest first.

### Community 69 - "delete_task"
Cohesion: 0.67
Nodes (3): delete_task(), delete, Delete a scheduled task.

### Community 70 - "revoke_share_link"
Cohesion: 0.67
Nodes (3): delete, Revoke a share link (creator only)., revoke_share_link()

## Knowledge Gaps
- **172 isolated node(s):** `PageEntry`, `SearchResult`, `SearchResult`, `ShareDialogProps`, `ShareLink` (+167 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 513 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get_user_project_ids()` connect `get_user_project_ids` to `incidents.py`, `database.py`, `team.py`, `SecurityTriageService`, `monitoring.py`, `comments.py`, `_assert_owns`, `plugins.py`, `upload_file`, `deployments.py`, `routers/ai.py`, `start_rollback`, `automation.py`?**
  _High betweenness centrality (0.050) - this node is a cross-community bridge._
- **Why does `get_current_user()` connect `database.py` to `incidents.py`, `auth.py`, `team.py`, `SecurityTriageService`, `monitoring.py`, `comments.py`, `plugins.py`, `deployments.py`, `get_user_project_ids`, `routers/ai.py`, `automation.py`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `react` connect `App.tsx` to `Dashboard.tsx`, `Monitoring.tsx`, `PlatformContext.tsx`, `api.ts`, `Settings.tsx`, `isApiAvailable`, `QueryProvider.tsx`, `AutomationHub.tsx`, `AutomationHub`, `ProjectDetails.tsx`, `PipelineCenter.tsx`, `Integrations.tsx`, `PipelineStageBar.tsx`, `package.json`, `Incidents.tsx`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **What connects `PageEntry`, `SearchResult`, `SearchResult` to the rest of the system?**
  _172 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `incidents.py` be split into smaller, more focused modules?**
  _Cohesion score 0.05928614640048397 - nodes in this community are weakly interconnected._
- **Should `App.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09082125603864734 - nodes in this community are weakly interconnected._
- **Should `auth.py` be split into smaller, more focused modules?**
  _Cohesion score 0.08668076109936575 - nodes in this community are weakly interconnected._