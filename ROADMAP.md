# Aether IDP — Feature Roadmap & Gap Analysis

> **Last Updated:** September 2026
> **Scope:** Collaboration, Communication, Automation, and improvements to existing features.
> **Excluded:** Kanban/Scrum boards, project management features (out of scope for this project).
> **Progress:** Phases 1–3 complete · Phase 4 complete · Phase 5 partial (sharing + settings done)

---

## Table of Contents

1. [Free Tools & Libraries Reference](#1-free-tools--libraries-reference)
2. [Part A — Existing Features Needing Improvement](#2-part-a--existing-features-needing-improvement)
3. [Part B — New Features To Implement](#3-part-b--new-features-to-implement)
4. [Part C — Implementation Priority Matrix](#4-part-c--implementation-priority-matrix)
5. [Part D — Database Schema Changes](#5-part-d--database-schema-changes)
6. [Part E — New API Endpoints](#6-part-e--new-api-endpoints)
7. [Part F — Frontend Components](#7-part-f--frontend-components)

---

## 1. Free Tools & Libraries Reference

### Notifications & Email (100% Free)

| Tool | Purpose | Free Tier | Why |
|---|---|---|---|
| **Resend** | Transactional email | 3,000 emails/month free, 100/day | Simple API, React Email integration, generous free tier |
| **React Email** | Email templates | Fully free (open source) | Build email templates in React/JSX, works with Resend |
| **Nodemailer** | SMTP email (self-hosted) | Fully free (open source) | If you want to use Gmail SMTP or any free SMTP provider |
| **Brevo (Sendinblue)** | Email + SMS | 300 emails/day free | Good alternative to Resend with higher daily limit |
| **Supabase Edge Functions** | Serverless webhooks | 500K invocations/month free | Run notification logic on Supabase directly |

**Recommendation:** Use **Resend + React Email** for email notifications. Zero cost for typical usage.

### File Storage (100% Free)

| Tool | Purpose | Free Tier | Why |
|---|---|---|---|
| **Supabase Storage** | File uploads/attachments | 1 GB free storage, 2 GB bandwidth | Already using Supabase — zero new infra |
| **Cloudflare R2** | Object storage | 10 GB free, no egress fees | If Supabase storage isn't enough |
| **AWS S3** | Object storage | 5 GB free for 12 months | Overkill but available |

**Recommendation:** Use **Supabase Storage** — you already have it, just need to create a bucket.

### Real-Time (100% Free)

| Tool | Purpose | Free Tier | Why |
|---|---|---|---|
| **Supabase Realtime** | Database change streaming | 200 concurrent connections free | Already partially enabled (publications exist) |
| **Socket.IO** | WebSocket framework | Fully free (open source) | Better than raw WebSocket (rooms, reconnection, namespaces) |

**Recommendation:** Keep **Supabase Realtime** for DB-level events, upgrade backend WebSocket to use **Socket.IO** for richer real-time features.

### Automation & Scheduling (100% Free)

| Tool | Purpose | Free Tier | Why |
|---|---|---|---|
| **APScheduler** | Python cron/scheduler | Fully free (open source) | Lightweight, runs inside FastAPI process |
| **BullMQ + Redis** | Job queue | Fully free (open source) | For background tasks, but requires Redis |
| **Celery** | Distributed task queue | Fully free (open source) | Heavy, needs Redis/RabbitMQ broker |
| **FastAPI BackgroundTasks** | Simple async tasks | Built-in, free | Good for simple one-off tasks |
| **Supabase pg_cron** | Database-level cron | Fully free (PostgreSQL extension) | Schedule SQL tasks directly in Supabase |

**Recommendation:** Use **APScheduler** for scheduled automations (runs inside FastAPI). Use **FastAPI BackgroundTasks** for one-off async actions. Use **pg_cron** for DB-level scheduled jobs if needed.

### @Mentions (100% Free)

| Tool | Purpose | Free Tier | Why |
|---|---|---|---|
| **Custom implementation** | Parse @username in text | Free (code it yourself) | Simple regex + autocomplete dropdown |

**Recommendation:** Build it custom — it's just regex parsing + a user search dropdown. No library needed.

### Search (100% Free)

| Tool | Purpose | Free Tier | Why |
|---|---|---|---|
| **PostgreSQL full-text search** | Built-in search | Free (already using PostgreSQL) | `tsvector` + `tsquery`, no new infra |
| **pg_trgm** | Fuzzy/trigram search | Free (PostgreSQL extension) | For typo-tolerant search |

**Recommendation:** Use **PostgreSQL full-text search + pg_trgm** — zero new infrastructure.

### Collaboration

| Tool | Purpose | Free Tier | Why |
|---|---|---|---|
| **Custom implementation** | Activity feeds, mentions, comments | Free (code it yourself) | Straightforward CRUD + real-time updates |

---

## 2. Part A — Existing Features Needing Improvement

### A1. Comments System

**Current State:** Comments exist ONLY on incidents via `incident_comments` table. The frontend has comment UI only in `Incidents.tsx`.

**What Needs Improvement:**

| Gap | Details | Priority |
|---|---|---|
| Comments on deployments | No `deployment_comments` table or endpoints | HIGH |
| Comments on rollback operations | No `rollback_comments` table or endpoints | HIGH |
| Comments on projects | No `project_comments` table or endpoints | MEDIUM |
| Comments on monitoring alerts | No alert-level discussion | MEDIUM |
| Comment editing/deletion | Currently no way to edit or delete a comment | HIGH |
| Comment reactions (emoji) | No reaction system | LOW |
| Rich text in comments | Currently plain text only | MEDIUM |
| Comment threading (replies) | No reply-to-comment support | LOW |

**Files to Modify:**
- `backend/supabase_schema.sql` — Add `deployment_comments`, `rollback_comments` tables
- `backend/routers/deployments.py` — Add comment endpoints
- `backend/routers/rollback.py` — Add comment endpoints
- `backend/models/deployment.py` — Add comment response models
- `src/pages/DeploymentDetails.tsx` — Add comment section UI
- `src/pages/RollbackRecovery.tsx` — Add comment section UI
- `src/types/platform.ts` — Add `DeploymentComment`, `RollbackComment` types

---

### A2. Activity Feeds (Audit Trail)

**Current State:** Two separate systems:
- `audit_logs` — system-wide, user-scoped, only covers project + incident actions
- `incident_timeline` — incident-scoped timeline

**What Needs Improvement:**

| Gap | Details | Priority |
|---|---|---|
| Per-deployment activity feed | No timeline for deployment events (status changes, comments, syncs) | HIGH |
| Per-rollback activity feed | No timeline beyond `audit_logs` JSONB field | HIGH |
| Per-project activity feed | No consolidated activity view per project | HIGH |
| Per-alert activity feed | No history of alert state changes | MEDIUM |
| More audit actions logged | Deployment sync, plugin config changes, rollback triggers not always logged | HIGH |
| Activity feed UI component | No reusable `<ActivityFeed />` component — each page builds its own | HIGH |
| "Who did what" attribution | Audit logs store `user_name` as text, not FK — can become stale | MEDIUM |

**Files to Modify:**
- `backend/supabase_schema.sql` — Add `entity_timeline` table (generic)
- `backend/services/audit_service.py` — Expand to support all entity types
- `src/components/ActivityFeed.tsx` — New reusable component
- All detail pages — Integrate `<ActivityFeed />`

---

### A3. Notifications

**Current State:** In-app only. Stored in Supabase `notifications` table. WebSocket push for real-time. Settings preferences are UI-only (not persisted).

**What Needs Improvement:**

| Gap | Details | Priority |
|---|---|---|
| Email notifications | No email channel at all | **CRITICAL** |
| Notification preferences persistence | Settings page checkboxes are local state only | HIGH |
| Notification sound | No audio feedback | LOW |
| Notification grouping | All notifications listed flat, no grouping by entity or time | MEDIUM |
| Per-entity notification rules | Can't say "notify me only about critical incidents on project X" | MEDIUM |
| Slack/Discord notifications | No integration despite Slack plugin existing in seed data | MEDIUM |
| Deployment status notifications | Only incidents trigger notifications; deployments/rollbacks don't | HIGH |

**Files to Modify:**
- `backend/services/notification_service.py` — Add email dispatch via Resend
- `backend/config.py` — Add `RESEND_API_KEY`, `FROM_EMAIL` env vars
- `backend/supabase_schema.sql` — Add `notification_preferences` table
- `backend/routers/notifications.py` — Add preferences CRUD endpoint
- `src/pages/Settings.tsx` — Persist notification preferences to backend
- `src/pages/Notifications.tsx` — Add grouping, filtering

---

### A4. Real-Time / WebSocket

**Current State:** Basic WebSocket in `main.py`. In-memory connection store. Only `notification.new` event is actually broadcast. Frontend handles 4 event types but 3 are never sent from backend.

**What Needs Improvement:**

| Gap | Details | Priority |
|---|---|---|
| Broadcast deployment status changes | Frontend handles `deployment.status_changed` but backend never sends it | HIGH |
| Broadcast incident creation | Frontend handles `incident.created` but backend never sends it | HIGH |
| Broadcast rollback progress | Frontend handles `rollback.progress` but backend never sends it | HIGH |
| WebSocket authentication | No token verification during WS handshake — anyone can connect | HIGH |
| Multi-worker support | In-memory dict doesn't work across uvicorn workers | MEDIUM |
| Connection persistence | Connections lost on server restart | MEDIUM |
| Presence/status (who's online) | No online user tracking | LOW |
| Typing indicators | No "user is typing" indicator in comments | LOW |

**Files to Modify:**
- `backend/main.py` — Add WS auth, upgrade to Socket.IO or use Redis for multi-worker
- `backend/services/notification_service.py` — Already broadcasts (good)
- `backend/routers/deployments.py` — Add `broadcast_to_user()` on status change
- `backend/routers/incidents.py` — Add `broadcast_to_user()` on create/update
- `backend/routers/rollback.py` — Add `broadcast_to_user()` on progress

---

### A5. Settings Page

**Current State:** 5 sections, mostly cosmetic. Provider connections persist. Everything else is local React state.

**What Needs Improvement:**

| Gap | Details | Priority |
|---|---|---|
| Notification preferences not saved | Checkboxes are UI-only | HIGH |
| Email configuration | No way to add email address for notifications | HIGH |
| API key management | No way to generate/revoke personal API tokens | MEDIUM |
| Theme/dark mode toggle | Only dark theme exists, no light mode option | LOW |
| Timezone setting | No timezone configuration | LOW |
| Profile editing | Read-only profile display | MEDIUM |
| Password change | No password change functionality | MEDIUM |
| Two-factor auth | No 2FA support | LOW |
| Session management | No view of active sessions | LOW |

**Files to Modify:**
- `backend/supabase_schema.sql` — Add `notification_preferences`, `api_keys` tables
- `backend/routers/settings.py` — New router for settings CRUD
- `src/pages/Settings.tsx` — Complete rewrite with persistent settings

---

### A6. Team Management

**Current State:** `teamMembers` exists only in frontend state. No `team_members` database table. Team data is lost on refresh (restored from seed data).

**What Needs Improvement:**

| Gap | Details | Priority |
|---|---|---|
| No database backing | Team members only in React state + localStorage | HIGH |
| No invitation system | Can't actually invite users — just adds to local list | HIGH |
| No role-based permissions | `role` field exists but isn't enforced anywhere | HIGH |
| No project-level team assignment | Team members are per-user, not per-project in DB | MEDIUM |
| No team activity tracking | Can't see what team members did | MEDIUM |

**Files to Modify:**
- `backend/supabase_schema.sql` — Add `team_members` table
- `backend/routers/team.py` — New router for team CRUD
- `src/pages/Settings.tsx` — Connect team management to backend

---

### A7. AI Assistant

**Current State:** Per-incident root-cause analysis using Groq/OpenAI. Basic chat interface.

**What Needs Improvement:**

| Gap | Details | Priority |
|---|---|---|
| No deployment-level analysis | AI only works on incidents, not failed deployments directly | MEDIUM |
| No cross-entity correlation | AI doesn't correlate alerts + deployments + incidents together | MEDIUM |
| No natural language search | Can't ask "show me all failed deploys this week" in natural language | LOW |
| No AI-generated summaries | No summary cards for long incidents or deployment logs | MEDIUM |
| No suggested actions from AI | `suggested_action` exists on incidents but is manually set, not AI-generated | MEDIUM |
| Chat history not persisted | AI chat messages lost on page refresh | MEDIUM |

**Files to Modify:**
- `backend/routers/ai.py` — Add deployment analysis, correlation endpoints
- `backend/services/ai_service.py` — Enhance prompts, add summary generation
- `src/pages/AIAssistant.tsx` — Persist chat, add deployment context

---

## 3. Part B — New Features To Implement

### B1. @Mentions System

**Description:** Allow users to @mention team members in comments across all entities. Mentioned users receive a notification.

**Requirements:**
- Parse `@username` patterns in comment text
- Show autocomplete dropdown as user types `@`
- Send notification to mentioned user
- Highlight mentions in rendered comments
- Works in incidents, deployments, rollback, project comments

**Tech Stack:** Custom implementation (regex + user search API)

**Database Changes:**
- No new table needed — mentions stored as part of comment `content` text
- Optional: `comment_mentions` junction table for efficient notification queries

**New Endpoints:**
- `GET /team/search?q={query}` — Search team members for autocomplete

**Frontend Components:**
- `src/components/MentionInput.tsx` — Textarea with @mention autocomplete
- `src/components/MentionText.tsx` — Renders text with highlighted mentions

---

### B2. File Attachments

**Description:** Attach files (screenshots, log files, documents) to comments on any entity.

**Requirements:**
- Upload files via drag-and-drop or file picker
- Store files in Supabase Storage
- Show file preview (images) or download link (other files)
- File size limit: 10 MB per file
- Supported types: images (png, jpg, gif), logs (.log, .txt), documents (pdf, md)
- Attachments linked to comments (not standalone)

**Tech Stack:** Supabase Storage + custom upload component

**Database Changes:**
- Add `attachments` column (JSONB array) to all comment tables
- Or create a generic `attachments` table

**New Endpoints:**
- `POST /upload` — Upload file, returns `{ url, filename, size, mime_type }`
- `DELETE /upload/{attachment_id}` — Delete attachment

**Frontend Components:**
- `src/components/FileUpload.tsx` — Drag-and-drop upload zone
- `src/components/AttachmentPreview.tsx` — Image preview / file card

---

### B3. Email Notifications

**Description:** Send email notifications for critical events (new incident, deployment failure, rollback completion, @mention).

**Requirements:**
- Email on new incident created (to project team members)
- Email on incident severity escalation
- Email on deployment failure
- Email on rollback completion
- Email when @mentioned in a comment
- Unsubscribe link in every email
- Respects user notification preferences

**Tech Stack:** Resend (free tier: 3,000/month) + React Email

**Database Changes:**
- Add `email` column to `notification_preferences` or use existing user email
- Add `email_unsubscribed` boolean

**New Endpoints:**
- `POST /notifications/preferences` — Save notification preferences
- `GET /notifications/preferences` — Get notification preferences
- `GET /notifications/unsubscribe?token={token}` — Unsubscribe from emails

**New Files:**
- `backend/services/email_service.py` — Resend integration
- `backend/emails/` — React Email templates directory
  - `incident_created.tsx`
  - `deployment_failed.tsx`
  - `rollback_completed.tsx`
  - `mention_notification.tsx`

---

### B4. Activity Feeds (Per-Entity)

**Description:** Each project, deployment, incident, and rollback has its own chronological activity feed showing all actions taken on it.

**Requirements:**
- Activity feed on project detail page
- Activity feed on deployment detail page
- Activity feed on rollback detail page
- (Incidents already have timeline — extend it)
- Shows: status changes, comments, assignments, AI analyses, webhooks, rollbacks
- Real-time updates via WebSocket
- Filterable by action type

**Tech Stack:** New `entity_activities` table + Supabase Realtime

**Database Changes:**
```sql
CREATE TABLE entity_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,          -- 'project' | 'deployment' | 'incident' | 'rollback'
  entity_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users,
  user_name TEXT,
  action TEXT NOT NULL,               -- 'status_change' | 'comment' | 'assigned' | 'webhook' | etc.
  description TEXT,
  metadata JSONB DEFAULT '{}',       -- Additional context data
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**New Endpoints:**
- `GET /activities?entity_type={type}&entity_id={id}` — Get activities for an entity
- `POST /activities` — Create activity (internal, called by other services)

---

### B5. Rule-Based Automation Engine

**Description:** Let users define automation rules like "When X happens, do Y". Example: "When a deployment fails, automatically create an incident with severity=high."

**Requirements:**
- Visual rule builder (when trigger → if condition → then action)
- Pre-built triggers: deployment status change, incident created, alert fired, rollback completed
- Pre-built conditions: severity equals, status equals, project matches, branch matches
- Pre-built actions: create incident, send notification, assign to user, trigger rollback, send email
- Rules stored in database, evaluated on backend
- Enable/disable rules per project
- Activity log of rule executions

**Tech Stack:** APScheduler + custom rule evaluator in FastAPI

**Database Changes:**
```sql
CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users NOT NULL,
  trigger_type TEXT NOT NULL,          -- 'deployment.status_change' | 'incident.created' | 'alert.fired'
  trigger_config JSONB DEFAULT '{}',   -- { statuses: ['failed'], branches: ['main'] }
  conditions JSONB DEFAULT '[]',       -- [{ field: 'severity', operator: 'equals', value: 'critical' }]
  actions JSONB DEFAULT '[]',          -- [{ type: 'create_incident', config: {...} }, { type: 'send_email', config: {...} }]
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES automation_rules(id) ON DELETE CASCADE,
  triggered_by TEXT,                    -- entity type that triggered it
  triggered_id UUID,                    -- entity ID that triggered it
  status TEXT DEFAULT 'success',        -- 'success' | 'failed' | 'skipped'
  result JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ DEFAULT NOW()
);
```

**New Files:**
- `backend/routers/automation.py` — CRUD for rules + execution log
- `backend/services/automation_engine.py` — Rule evaluation logic
- `backend/models/automation.py` — Pydantic models

**New Endpoints:**
- `GET /automation/rules` — List rules
- `POST /automation/rules` — Create rule
- `PATCH /automation/rules/{id}` — Update rule
- `DELETE /automation/rules/{id}` — Delete rule
- `POST /automation/rules/{id}/toggle` — Enable/disable
- `GET /automation/executions?rule_id={id}` — Execution history

**Frontend Components:**
- `src/pages/Automation.tsx` — Rule list + builder page
- `src/components/RuleBuilder.tsx` — Visual when/then rule editor

---

### B6. Automated Transitions

**Description:** When automation rules fire, automatically transition entities through states. Example: auto-resolve incidents after successful rollback, auto-assign incidents to on-call person.

**Requirements:**
- Auto-create incidents from failed deployments
- Auto-assign incidents based on project ownership or severity
- Auto-resolve incidents when related deployment succeeds
- Auto-trigger rollback on consecutive failures (configurable threshold)
- Auto-close stale incidents after X days
- All transitions logged in audit trail

**Tech Stack:** Built into automation engine (B5)

**Implementation:**
- Hook into existing service functions (incident_service, deployment_service)
- Add transition logic in `automation_engine.py`
- Each transition writes to `entity_activities` + `audit_logs`

---

### B7. Scheduled Automations

**Description:** Run recurring tasks on a schedule. Example: "Every Monday at 9am, generate a weekly deployment summary report."

**Requirements:**
- Cron-like scheduling (cron expressions)
- Pre-built schedules: daily, weekly, on-demand
- Pre-built report types: deployment summary, incident summary, team activity
- Scheduled health checks for projects
- Scheduled alert sync from monitoring tools
- Email digest (daily/weekly summary)

**Tech Stack:** APScheduler (runs inside FastAPI process)

**Database Changes:**
```sql
CREATE TABLE scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  cron_expression TEXT NOT NULL,        -- '0 9 * * 1' = every Monday 9am
  task_type TEXT NOT NULL,              -- 'report' | 'health_check' | 'alert_sync' | 'email_digest'
  task_config JSONB DEFAULT '{}',       -- { report_type: 'deployment_summary', recipients: [...] }
  project_id UUID REFERENCES projects(id) ON DELETE NULL,
  owner_id UUID REFERENCES auth.users NOT NULL,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**New Files:**
- `backend/services/scheduler_service.py` — APScheduler setup + job registration
- `backend/routers/scheduled_tasks.py` — CRUD for scheduled tasks

**New Endpoints:**
- `GET /scheduled-tasks` — List scheduled tasks
- `POST /scheduled-tasks` — Create scheduled task
- `PATCH /scheduled-tasks/{id}` — Update
- `DELETE /scheduled-tasks/{id}` — Delete
- `POST /scheduled-tasks/{id}/run` — Run immediately
- `GET /scheduled-tasks/{id}/runs` — Run history

---

### B8. Webhook-Triggered Automations (Enhanced)

**Description:** Extend existing webhook receivers to trigger automation rules. Currently webhooks just create events — make them trigger configurable actions.

**Requirements:**
- GitHub webhook → trigger on push, PR, release events
- Vercel webhook → already works, add rule triggers
- Netlify webhook → already works, add rule triggers
- Grafana webhook → already works, add rule triggers
- Custom webhook → generic webhook receiver for any external tool
- Each webhook event evaluates against active automation rules

**Tech Stack:** Existing webhook infrastructure + automation engine

**Files to Modify:**
- `backend/webhooks/vercel.py` — After processing, evaluate automation rules
- `backend/webhooks/netlify.py` — Same
- `backend/webhooks/grafana.py` — Same
- `backend/services/automation_engine.py` — Add `evaluate_trigger()` function

---

### B9. Guest / External Access

**Description:** Generate shareable read-only links for specific entities (incidents, deployments, dashboards) for external stakeholders.

**Requirements:**
- Generate time-limited share links
- Read-only access (no editing)
- Optional password protection
- Track who accessed the link
- Revoke links at any time
- Works for: incidents, deployments, project dashboards

**Tech Stack:** UUID tokens + Supabase RLS bypass for public routes

**Database Changes:**
```sql
CREATE TABLE share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,           -- 'incident' | 'deployment' | 'project'
  entity_id UUID NOT NULL,
  token TEXT UNIQUE NOT NULL,          -- Random UUID used in URL
  password_hash TEXT,                  -- Optional password protection
  created_by UUID REFERENCES auth.users NOT NULL,
  expires_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**New Files:**
- `backend/routers/sharing.py` — Generate/revoke/share links
- `src/pages/SharedView.tsx` — Public read-only view (no auth required)

**New Endpoints:**
- `POST /share` — Generate share link
- `GET /share/{token}` — Access shared entity (public, no auth)
- `DELETE /share/{token}` — Revoke link
- `GET /share/{token}/verify` — Verify password if protected

---

### B10. Advanced Search

**Description:** Full-text search across all entities with filters.

**Requirements:**
- Search across: projects, deployments, incidents, comments, audit logs
- Filters: entity type, date range, status, severity, project, author
- Search in comment content
- Recent searches saved
- Keyboard shortcut (Ctrl+K) to open search

**Tech Stack:** PostgreSQL full-text search + pg_trgm

**Database Changes:**
```sql
-- Add full-text search columns
ALTER TABLE incidents ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED;

CREATE INDEX incidents_search_idx ON incidents USING GIN(search_vector);

-- Enable pg_trgm for fuzzy search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

**New Endpoints:**
- `GET /search?q={query}&type={entity_type}&project_id={id}` — Search endpoint

**Frontend Components:**
- `src/components/SearchModal.tsx` — Ctrl+K search overlay
- `src/components/SearchResults.tsx` — Grouped search results

---

### B11. Dashboard Customization

**Description:** Let users arrange widgets on their dashboard.

**Requirements:**
- Draggable widget grid
- Widget types: deployment status, incident summary, team activity, alert feed, charts
- Save layout per user
- Default layout for new users

**Tech Stack:** `react-grid-layout` (free, MIT license)

**Database Changes:**
```sql
ALTER TABLE auth.users ADD COLUMN dashboard_config JSONB DEFAULT '{}';
-- Or a separate table if Supabase auth users can't be altered easily
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  dashboard_layout JSONB DEFAULT '[]',
  theme TEXT DEFAULT 'dark',
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**New Components:**
- `src/components/DashboardWidget.tsx` — Wrapper for each widget
- `src/components/WidgetGrid.tsx` — Drag-and-drop grid layout

---

### B12. Time Tracking

**Description:** Track time spent on incident resolution and deployment issues.

**Requirements:**
- Auto-calculate time from incident creation to resolution
- Manual time entry for investigation time
- Time breakdown by severity
- Report: average time-to-resolve by severity
- Report: MTTR (Mean Time To Resolution) trend

**Database Changes:**
```sql
-- Add time tracking to incidents
ALTER TABLE incidents ADD COLUMN resolution_time_ms BIGINT;
ALTER TABLE incidents ADD COLUMN investigation_time_ms BIGINT DEFAULT 0;

-- Or a dedicated time entries table
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users NOT NULL,
  description TEXT,
  duration_ms BIGINT NOT NULL,
  entry_type TEXT DEFAULT 'manual',  -- 'auto' | 'manual'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 4. Part C — Implementation Priority Matrix

> **Status legend:** ✅ Done · 🟡 Partial (backend done, UI remaining) · ⬜ Not started

### Phase 1: Core Collaboration (Week 1-2) — ✅ Complete

| # | Feature | Status | Effort | Impact | Dependencies |
|---|---|---|---|---|---|
| 1 | **Comment system expansion** (deployments, rollbacks) | ✅ | Medium | High | None |
| 2 | **@Mentions in comments** | ✅ | Medium | High | #1 |
| 3 | **Activity feeds per entity** | ✅ | Medium | High | None |
| 4 | **Comment edit/delete** | ✅ | Small | Medium | None |

### Phase 2: Notifications & Email (Week 3-4) — ✅ Complete

| # | Feature | Status | Effort | Impact | Dependencies |
|---|---|---|---|---|---|
| 5 | **Email notifications** (Resend) | ✅ | Medium | **Critical** | None |
| 6 | **Notification preferences** (persist to DB) | ✅ | Small | High | None |
| 7 | **Deployment/rollback notification triggers** | ✅ | Small | High | #5 |
| 8 | **WebSocket fixes** (broadcast all 4 event types) | ✅ | Small | High | None |

### Phase 3: File Attachments & Search (Week 5-6) — ✅ Complete

| # | Feature | Status | Effort | Impact | Dependencies |
|---|---|---|---|---|---|
| 9 | **File attachments** (Supabase Storage) | ✅ | Medium | High | None |
| 10 | **Advanced search** (PostgreSQL FTS + Ctrl+K SearchModal) | ✅ | Medium | High | None |

### Phase 4: Automation Engine (Week 7-9) — ✅ Complete

| # | Feature | Status | Effort | Impact | Dependencies |
|---|---|---|---|---|---|
| 11 | **Rule-based automation** | ✅ | Large | High | None |
| 12 | **Automated transitions** | ✅ | Medium | High | #11 |
| 13 | **Webhook-triggered automations** | ✅ | Medium | High | #11 |
| 14 | **Scheduled automations** (APScheduler) | ✅ | Medium | Medium | #11 |

### Phase 5: Polish & Advanced (Week 10-12) — 🟡 In progress

| # | Feature | Status | Effort | Impact | Dependencies |
|---|---|---|---|---|---|
| 15 | **Guest/share links** | ✅ | Medium | Medium | None |
| 16 | **Dashboard customization** | ⬜ | Medium | Medium | None |
| **B12** | **Time tracking** | ⬜ | Small | Medium | None |
| 18 | **Settings page overhaul** | 🟡 | Medium | Medium | #6 |

---

## 5. Part D — Database Schema Changes

### New Tables Summary

```sql
-- ===== COLLABORATION =====

-- Comments for deployments
CREATE TABLE deployment_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users NOT NULL,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  content TEXT NOT NULL,
  edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments for rollback operations
CREATE TABLE rollback_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rollback_id UUID REFERENCES rollback_operations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users NOT NULL,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  content TEXT NOT NULL,
  edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Generic activity feed for all entities
CREATE TABLE entity_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users,
  user_name TEXT,
  action TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_activities_entity ON entity_activities(entity_type, entity_id);

-- ===== FILE ATTACHMENTS =====

CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL,
  comment_type TEXT NOT NULL,          -- 'incident' | 'deployment' | 'rollback' | 'project'
  user_id UUID REFERENCES auth.users NOT NULL,
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== NOTIFICATIONS =====

CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  email_notifications BOOLEAN DEFAULT TRUE,
  incident_created BOOLEAN DEFAULT TRUE,
  incident_escalated BOOLEAN DEFAULT TRUE,
  deployment_failed BOOLEAN DEFAULT TRUE,
  rollback_completed BOOLEAN DEFAULT TRUE,
  mention_received BOOLEAN DEFAULT TRUE,
  daily_digest BOOLEAN DEFAULT FALSE,
  weekly_digest BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== AUTOMATION =====

CREATE TABLE automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users NOT NULL,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  conditions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES automation_rules(id) ON DELETE CASCADE,
  triggered_by TEXT,
  triggered_id UUID,
  status TEXT DEFAULT 'success',
  result JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== SCHEDULED TASKS =====

CREATE TABLE scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  cron_expression TEXT NOT NULL,
  task_type TEXT NOT NULL,
  task_config JSONB DEFAULT '{}',
  project_id UUID REFERENCES projects(id) ON DELETE NULL,
  owner_id UUID REFERENCES auth.users NOT NULL,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== SHARING =====

CREATE TABLE share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  token TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  created_by UUID REFERENCES auth.users NOT NULL,
  expires_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== SEARCH =====

-- Full-text search indexes (run after tables exist)
-- incidents
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS incidents_search_idx ON incidents USING GIN(search_vector);

-- deployments
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(commit_message, '') || ' ' || coalesce(version, '') || ' ' || coalesce(branch, ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS deployments_search_idx ON deployments USING GIN(search_vector);

-- ===== TEAM =====

CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'developer',
  added_by UUID REFERENCES auth.users,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, project_id)
);

-- ===== USER PREFERENCES =====

CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users,
  dashboard_layout JSONB DEFAULT '[]',
  theme TEXT DEFAULT 'dark',
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== REALTIME PUBLICATIONS =====

-- Add new tables to Supabase Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE entity_activities;
ALTER PUBLICATION supabase_realtime ADD TABLE deployment_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE rollback_comments;
```

---

## 6. Part E — New API Endpoints

### Comments (Expansions)

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/deployments/{id}/comments` | List deployment comments |
| `POST` | `/deployments/{id}/comments` | Add deployment comment |
| `PATCH` | `/deployments/{id}/comments/{comment_id}` | Edit comment |
| `DELETE` | `/deployments/{id}/comments/{comment_id}` | Delete comment |
| `GET` | `/rollback/{id}/comments` | List rollback comments |
| `POST` | `/rollback/{id}/comments` | Add rollback comment |
| `PATCH` | `/rollback/{id}/comments/{comment_id}` | Edit comment |
| `DELETE` | `/rollback/{id}/comments/{comment_id}` | Delete comment |

### Activity Feeds

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/activities?entity_type={}&entity_id={}` | Get entity activities |
| `POST` | `/activities` | Create activity (internal) |

### File Upload

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/upload` | Upload file (multipart/form-data) |
| `DELETE` | `/upload/{attachment_id}` | Delete uploaded file |
| `GET` | `/upload/{attachment_id}` | Get attachment info |

### Notifications (Expansions)

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/notifications/preferences` | Get notification prefs |
| `POST` | `/notifications/preferences` | Save notification prefs |
| `GET` | `/notifications/unsubscribe?token={}` | Unsubscribe from email |

### @Mentions

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/team/search?q={}` | Search users for @mention autocomplete |

### Automation

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/automation/rules` | List rules |
| `POST` | `/automation/rules` | Create rule |
| `GET` | `/automation/rules/{id}` | Get rule detail |
| `PATCH` | `/automation/rules/{id}` | Update rule |
| `DELETE` | `/automation/rules/{id}` | Delete rule |
| `GET` | `/automation/executions?limit={}` | Execution history |
| `GET` | `/automation/triggers` | List available triggers |
| `POST` | `/automation/test` | Dry-run rule against sample event |

### Scheduled Tasks

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/scheduled-tasks` | List tasks |
| `POST` | `/scheduled-tasks` | Create task |
| `PATCH` | `/scheduled-tasks/{id}` | Update task |
| `DELETE` | `/scheduled-tasks/{id}` | Delete task |
| `POST` | `/scheduled-tasks/{id}/run` | Run now |
| `GET` | `/scheduled-tasks/status` | Scheduler availability + active jobs |

### Sharing

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/share` | Generate share link (auth) |
| `GET` | `/share/mine` | List my share links (auth) |
| `GET` | `/share/{entity_type}/{entity_id}?token={}` | Public token-based view (no auth) |
| `DELETE` | `/share/{link_id}` | Revoke link (auth, creator only) |

### Search

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/search?q={}&type={}&project_id={}` | Full-text search |

---

## 7. Part F — Frontend Components

### New Components To Build

| Component | Purpose | Used In | Status |
|---|---|---|---|
| `MentionInput.tsx` | Textarea with @mention autocomplete dropdown | All comment forms | ✅ |
| `MentionText.tsx` | Renders text with highlighted @mentions | All comment displays | ✅ |
| `FileUpload.tsx` | Drag-and-drop file upload zone | All comment forms | ✅ (in CommentSection) |
| `AttachmentPreview.tsx` | Image preview or file download card | All comment displays | ✅ (in CommentSection) |
| `ActivityFeed.tsx` | Reusable chronological activity timeline | All detail pages | ✅ |
| `SearchModal.tsx` | Ctrl+K search overlay | Global (App.tsx) | ✅ |
| `RuleBuilder.tsx` | Visual when/then automation rule editor | Automation page | ⬜ |
| `ShareDialog.tsx` | Generate & manage share links | Detail pages | ⬜ |
| `EmailPreferences.tsx` | Email notification toggle switches | Settings page | ✅ |
| `DashboardWidget.tsx` | Wrapper for draggable dashboard widgets | Dashboard | ⬜ |

### Pages To Build

| Page | Route | Purpose |
|---|---|---|
| `Automation.tsx` | `automation` | Rule list + create/edit |
| `ScheduledTasks.tsx` | `scheduled-tasks` | Scheduled task management |
| `SharedView.tsx` | `s/:token` | Public read-only view (no sidebar) |
| `SearchResults.tsx` | `search` | Full search results page |

### Pages To Modify

| Page | Changes |
|---|---|
| `Settings.tsx` | Complete overhaul — persist preferences, add email config, team management with DB |
| `DeploymentDetails.tsx` | Add comments section + activity feed |
| `RollbackRecovery.tsx` | Add comments section + activity feed |
| `ProjectDetails.tsx` | Add activity feed + share button |
| `Incidents.tsx` | Upgrade comments with @mentions + attachments |
| `Monitoring.tsx` | Add comments on alerts + activity feed |
| `Notifications.tsx` | Add grouping, filtering, preferences link |
| `Dashboard.tsx` | Add customizable widget grid |
| `AIAssistant.tsx` | Persist chat history, add deployment context |
| `App.tsx` | Add SearchModal, new routes (automation, scheduled-tasks, shared) |
| `Sidebar.tsx` | Add Automation nav item |
| `PlatformContext.tsx` | Add state + actions for new features |

---

## Summary Stats

| Metric | Count |
|---|---|
| New database tables | 8 |
| New API endpoints | ~25 |
| New frontend components | 10 |
| New pages | 4 |
| Existing pages to modify | 11 |
| New backend services | 5 |
| New backend routers | 4 |
| Estimated total new files | ~30 |
| Estimated total modified files | ~20 |
| **Total estimated effort** | **10-12 weeks (solo developer)** |

---

## Environment Variables To Add

```bash
# Email (Resend)
RESEND_API_KEY=re_xxxxx
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=Aether IDP

# File Storage (Supabase - already have SUPABASE_URL and SUPABASE_KEY)
SUPABASE_STORAGE_BUCKET=attachments

# Automation
AUTOMATION_ENABLED=true
SCHEDULER_TIMEZONE=UTC

# Sharing
SHARE_LINK_SECRET=your-random-secret-for-token-generation
SHARE_LINK_DEFAULT_EXPIRY_DAYS=7
```
