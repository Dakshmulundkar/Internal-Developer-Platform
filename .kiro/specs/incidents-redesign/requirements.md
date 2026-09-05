# Incidents Page Redesign — Requirements

## Overview
Redesign the Incidents page to match the reference UI (GitGuardian-style incident management). The page should have a professional incident tracking layout with a rich list view and a full split-panel detail view with tabbed navigation. Later phases add a real FastAPI + Supabase backend replacing all localStorage/seedData mocks.

---

## Phase 1 — Frontend UI Redesign

### User Story 1: Incident List View
- As a user, I want to see all incidents in a table-style list with columns for: title, severity badge, project/info, tags, and status badge
- As a user, I want to filter incidents using a tab bar: Open | All | Critical | Investigating | Resolved
- As a user, I want to see active filter chips below the tab bar showing what filters are applied, each dismissible with ×
- As a user, I want to see a results count (e.g. "3 results / 6") and sort/display controls
- As a user, I want each incident row to be clickable to open the detail view
- As a user, I want checkboxes to appear on row hover for bulk actions (visual only in Phase 1)
- As a user, I want to be able to search incidents by title or project name

### User Story 2: Incident Detail — Split Layout
- As a user, when I click an incident, the page transitions to a split layout: left content panel (~65%) + right details sidebar (~35%)
- As a user, I want a breadcrumb at the top: Incidents > [Incident Title]
- As a user, I want to navigate back to the list view via a Back button
- As a user, the URL-equivalent state (selectedId) persists navigation from other pages via activeIncidentId

### User Story 3: Detail — 4-Tab Navigation (Left Panel)
- As a user, I want 4 tabs inside the detail left panel: Overview | Locations | Feedback | Activity
- As a user, the tab bar and the right sidebar persist and remain visible across all 4 tab switches
- As a user, switching tabs does not reset the right sidebar state

### User Story 4: Overview Tab
- As a user, I want to see incident description and a key-value table of deployment/incident details
  - Fields: Project, Provider, Deployment ID, Commit Hash, Commit Message, Branch, Error Message, Suggested Action
- As a user, I want to see deployment build logs in a terminal-style code block with line numbers
- As a user, I want "Inspect Full Logs" and "Initiate Rollback" action buttons below the logs

### User Story 5: Locations Tab
- As a user, I want to see an "Impacted Perimeter" section with 3 stat boxes:
  - Count of failed deployments for this project
  - Total timeline event count (occurrences)
  - Count of open incidents for this project
- As a user, I want to see a "Related Deployments" table with columns: Date | Author | Commit | Stage Failed | Status
- As a user, I want each deployment row to navigate to its deployment detail page on click

### User Story 6: Feedback Tab
- As a user, I want to answer "Is this a real incident?" with two toggle buttons: "Yes, it's real" | "It's a false positive"
- As a user, I want a textarea for additional comments with "Write your comment (use @ to mention someone)" placeholder
- As a user, I want a Submit button that records feedback as a comment in the incident timeline
- As a user, after submitting I want to see an inline success confirmation message

### User Story 7: Activity Tab
- As a user, I want filter buttons: All | Actions | Comments
- As a user, I want a comment input textarea with a Submit button at the top
- As a user, I want to see the full incident timeline rendered as a vertical activity feed with relative timestamps ("about 2 hours ago")
- As a user, I want each timeline event to have an appropriate icon: alert = AlertTriangle red, comment = MessageSquare, status change = CheckCircle green, action = Zap
- As a user, I want a visible connector line between timeline events

### User Story 8: Right Panel — Details Sidebar
- As a user, I want to always see a "Details" section regardless of which tab is active
- As a user, I want a large colored Status badge showing current incident status
- As a user, I want a "Resolve ▾" dropdown button with options:
  - "I confirmed and fixed the issue"
  - "I confirmed and this is not fixable now"
  - "Rolling back resolves this"
  - Selecting any option calls resolveIncident() and closes the dropdown
- As a user, I want an "Ignore ▾" dropdown button with options:
  - "This is a test deployment"
  - "This is a known flaky issue"
  - "This is not a real incident (false positive)"
  - "This deployment is deprecated"
  - Selecting updates incident with ignoredReason and marks as resolved
- As a user, I want the dropdowns to close when clicking outside (click-outside pattern)
- As a user, I want to see: Assignee | Occurred date | Detected date | Opened for (calculated duration) | Severity | Provider | Tags | Developer involved
- As a user, I want to see a "How to remediate" checklist section at the bottom of the sidebar:
  - Steps are AI-generated from aiExplanations[incident.deploymentId].recommendations
  - Each step: icon + bold title + description paragraph
  - The last step is always "You can mark the incident as resolved" as a clickable blue link calling resolveIncident()
  - If no AI data exists: show 3 generic fallback steps

### User Story 9: Functional Compatibility (no breaking changes)
- resolveIncident() context action must continue to work
- addComment() context action must continue to work
- All existing incident data (timeline, comments, suggestedAction) must be preserved and displayed
- Navigation from other pages to incidents via activeIncidentId must open the correct incident detail
- updateIncident() new action needed for ignore reason and feedback fields

### User Story 10: Source Plugin Column in List
- As a user, I want to see a "Source" column in the incident list showing which plugin or provider triggered this incident (Vercel, Netlify, Grafana, Datadog, Sentry, or Manual)
- As a user, I want the source shown as a small colored badge matching the plugin's color accent

### User Story 11: Related Alerts in Overview Tab
- As a user, I want to see any MonitoringAlerts linked to this incident (via incidentId match) shown in the Overview tab under a "Related Alerts" section
- As a user, I want each alert card to show: source badge | severity | title | value vs threshold | fired time

---

## Phase 2 — Real Backend Integration

### User Story 12: Real Authentication
- As a user, I want to register with email/password and have my account stored in Supabase Auth
- As a user, I want to log in with GitHub OAuth via Supabase
- As a user, I want to log in with Google OAuth via Supabase
- As a user, my session must be JWT-based and expire after inactivity
- As a user, my role (developer/operator/admin) must be stored and enforced

### User Story 13: Real Project and Deployment Data
- As a user, when I create a project, it must be stored in Supabase PostgreSQL, not localStorage
- As a user, deployment records received from Vercel/Netlify webhooks must be stored in Supabase
- As a user, I want real Vercel deployment data fetched via Vercel REST API v6 when a token is configured
- As a user, I want real Netlify deployment data fetched via Netlify REST API v1 when a token is configured
- As a user, build logs from the provider API should be fetched and stored

### User Story 14: Real Webhook Ingestion
- As a user, when Vercel or Netlify sends a deployment event webhook, it must be validated (signature check) and stored in the database
- As an operator, webhook failures must be retried idempotently
- As an operator, duplicate webhook events must be detected and skipped
- As a user, failed webhooks must trigger automatic incident creation via the incident module

### User Story 15: Real Incident Persistence
- As a user, incidents must be stored in Supabase PostgreSQL
- As a user, comments I add must be persisted in the database
- As a user, resolving an incident must update the database record and timestamp
- As a user, ignoring an incident must store the ignoredReason in the database
- As a user, feedback (feedbackIsReal, feedbackComment) must be stored per incident

### User Story 16: Real Rollback Execution
- As a user, when I confirm a rollback, the backend must call the real Vercel or Netlify API
  - Vercel: POST /v9/projects/{projectId}/alias with deploymentId
  - Netlify: POST /api/v1/sites/{siteId}/deploys/{deployId}/restore
- As a user, the rollback result must be polled and stored
- As a user, a failed rollback must create a notification and update the rollback operation record

### User Story 17: Real AI Analysis
- As a user, the AI assistant must use a real LLM API (e.g. OpenAI GPT-4o or similar free/cheap model) to generate:
  - Deployment failure explanations
  - Incident summaries
  - Remediation step recommendations
- As a user, the AI must receive structured context: error message, build logs, incident description, related alerts
- As a user, the "How to remediate" steps must be dynamically generated per incident, not pre-hardcoded
- As a user, AI responses must have a confidence score and a list of identified root causes

### User Story 18: Real Plugin Data Fetching
- As a user, when a Grafana plugin is configured with a real API key, the Monitoring page must show live alert data from Grafana
- As a user, when a Sentry plugin is configured, real Sentry issues for the linked project must appear
- As a user, when a Datadog plugin is configured, real monitor status must be pulled
- As an operator, plugin sync must run as a background job on the backend every N minutes
- As an operator, plugin errors must be isolated and not crash other platform features

### User Story 19: Real Audit Log Persistence
- As an operator, all actions (login, project create, rollback, incident resolve, plugin install) must be stored as immutable audit log records in Supabase
- As a user, the audit trail on the dashboard must load from the database, not localStorage

### User Story 20: Real Notification Delivery
- As a user, notifications must be persisted in Supabase
- As a user, new notifications from webhooks or incidents must appear in real time via WebSockets or Server-Sent Events
- As an operator, unread notification counts must be calculated server-side

---

## Non-Functional Requirements

- Provider credentials (API tokens, webhook secrets) must never be stored in frontend state or localStorage
- All tokens must be encrypted at rest in Supabase using Supabase Vault or environment variables
- Webhook processing must be idempotent — processing the same event twice must not create duplicate incidents
- The frontend must remain fully functional in offline/demo mode using seedData when no backend is available
- The backend must be containerized with Docker and deployed to Kubernetes via ArgoCD (GitOps model)
- The frontend must be deployable on Vercel or Netlify free tier
- Rate limiting must be applied to all public API routes
- All rollback operations require explicit user confirmation — no autonomous destructive actions

### User Story 21: ArgoCD GitOps Deployment
- As an operator, I want all backend infrastructure changes to be managed through Git (GitOps model)
- As an operator, when I push a new backend image to the container registry, ArgoCD must automatically sync and deploy the update to the Kubernetes cluster
- As an operator, I want ArgoCD to monitor the `k8s/` manifests directory and apply any drift corrections automatically
- As an operator, I want to be able to roll back the backend to any previous deployment via ArgoCD's revision history without touching code
- As an operator, I want each environment (dev/staging/production) represented as a separate ArgoCD Application targeting a different namespace

---

## Phase 1.5 — Single-Project Team UX + Plugin Data Display

> These requirements address the real usage pattern: most users have **one project**, a small team of developers led by one person who configures the platform and invites teammates.

### User Story 22: Project-Centric Dashboard
- As a user with one project, I want the Dashboard to immediately show the health of my project without navigating elsewhere
- As a user, I want the Dashboard to show: current deployment status, error count from Sentry, active Grafana/Datadog alerts, ArgoCD infrastructure sync status, and recent team activity — all scoped to my project(s)
- As a user, the existing multi-project metric cards should still work but show project-specific data when I have only one project

### User Story 23: Project Details — Monitoring Tab
- As a user, I want a "Monitoring" tab inside Project Details that shows all Grafana and Datadog alerts scoped to this project
- As a user, I want to see the current state of each alert: severity, value vs threshold, source badge, fired time
- As a user, I want a link from each alert to the full Monitoring page

### User Story 24: Project Details — Errors Tab
- As a user, I want an "Errors" tab inside Project Details showing all Sentry issues linked to this project
- As a user, I want to see: issue title, level (fatal/error/warning), occurrence count, first seen, last seen, and release version
- As a user, I want to expand a Sentry issue inline to see its stack trace
- As a user, I want clicking an issue to open the AI assistant with that Sentry error as context

### User Story 25: Project Details — Infrastructure Tab
- As a user, I want an "Infrastructure" tab inside Project Details showing the ArgoCD deployment state of the backend
- As a user, I want to see: ArgoCD app name, sync status (Synced/OutOfSync/Degraded), current deployed image tag (Git SHA), last sync timestamp
- As a user, I want a "Trigger Manual Sync" button that records the action in the audit log
- As a user, I want a rollback-to-previous-revision option linking to the Rollback & Recovery page

### User Story 26: Project Details — Team Tab
- As a team lead (admin role), I want to see all team members who have access to this project
- As a team lead, I want to invite a new developer by email with a role: viewer | developer | admin
- As a team lead, I want to remove a member from the project
- As a developer, I want to see my own role and the other members of the project
- Roles: `viewer` (read-only), `developer` (can comment and resolve incidents), `admin` (full access including rollback and plugin config)

### User Story 27: Deployment Details — Plugin Context Panel
- As a user, I want to see a "Plugin Signals" section on the Deployment Details page
- As a user, I want to see Grafana/Datadog alerts that fired within ±30 minutes of this deployment
- As a user, I want to see Sentry issues that were first introduced in this deployment's release version
- As a user, each signal links to the full alert/issue detail

### User Story 28: ArgoCD Data on Dashboard
- As an operator, I want to see ArgoCD sync status in the Integration Health panel on the Dashboard
- As an operator, I want to see: app name, Synced/OutOfSync/Degraded status, last sync time, and current image tag
- As an operator, "OutOfSync" or "Degraded" states should show in amber/red to draw attention

### User Story 29: Service Health Widget on Dashboard
- As a user, I want a "Service Health" widget on the Dashboard showing live plugin metrics:
  - Grafana: current p99 latency (if configured)
  - Sentry: unresolved error count and new errors in last 24h
  - Datadog: number of monitors currently alerting
- As a user, these metrics update every time the plugin syncs

### User Story 30: Deployment Details — Sentry Release Linkage
- As a user, I want Deployment Details to show Sentry issues introduced in the same release version as this deployment
- As a user, I want to see: issue title, level, count, first seen
- As a user, I want "Ask AI" to analyze these Sentry issues alongside the build logs

### User Story 31: Settings — Team Management
- As a team lead, I want a "Team Management" section in Settings
- As a team lead, I want to see all users who have access to any of my projects
- As a team lead, I want to invite a new user: enter email → assign role → send invite
- As a team lead, I want to edit a user's role or remove them
- As a developer, I want to see which projects I have access to and my role on each
- Team management is scoped per project — a user can have different roles on different projects

### User Story 32: Scoped Data — Developers Only See Their Projects
- As a developer (non-admin), I want to see only the projects I have been granted access to
- As a developer, I should not be able to see projects belonging to other teams or team leads
- As a developer with viewer role, rollback buttons and plugin configuration should be disabled/hidden
- As a developer with developer role, I can add comments and resolve incidents but cannot rollback or configure plugins
