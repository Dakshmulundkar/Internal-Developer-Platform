# Product Requirements Document (PRD)
# Aether IDP — Internal Developer Platform for Self-Service Delivery and Recovery

**Author:** Daksh Mulundkar
**Version:** 1.5
**Status:** Phase 1 + Phase 1.5 Complete · Phase 2 Spec Ready

---

## 1. Product Summary

Aether IDP is a centralized control-plane web application for software engineering teams. It connects to external deployment platforms (Vercel, Netlify), monitoring tools (Grafana, Datadog, Sentry), and source control (GitHub) through a plugin-based integration model.

The platform does **not** replace Vercel or Netlify. User applications continue to run on external providers. Aether acts as the operational layer — aggregating deployment events, surfacing monitoring alerts, managing incidents, running AI-assisted diagnosis, and executing controlled rollbacks.

---

## 2. Problem Statement

Modern engineering teams split their operational tooling across multiple disconnected services:

- Deployment status lives in Vercel or Netlify dashboards
- Error tracking lives in Sentry
- Infrastructure alerts live in Grafana or Datadog
- Incident communication lives in Slack or email
- Rollback is a manual, provider-specific process

This fragmentation causes slower incident response, inconsistent setups across projects, poor visibility during outages, and difficulty tracing recovery actions. There is no single place to go from "deployment failed" to "incident resolved."

---

## 3. Goals

1. Provide a single dashboard for deployment health, monitoring signals, and incident status
2. Enable self-service project onboarding in under 10 minutes
3. Surface AI-generated diagnosis within seconds of a deployment failure
4. Support controlled rollback with full audit trail
5. Allow a team lead to manage developer access per project
6. Work fully offline in demo mode with no backend dependency

---

## 4. Non-Goals

- Replacing Vercel, Netlify, or any hosting provider
- Hosting or managing user application infrastructure
- Autonomous destructive actions (rollbacks always require user confirmation)
- Full Kubernetes management for user-facing applications
- Enterprise billing or multi-tenant organization management

---

## 5. Target Users

| User | Description | Primary Need |
|------|-------------|--------------|
| Team Lead / Admin | Configures platform, installs plugins, manages team | Full control + oversight |
| Developer | Ships code, monitors deployments, handles incidents | Quick diagnosis + resolution |
| Operator | Monitors system health, handles rollbacks | Recovery workflows + audit trail |

---

## 6. Core Features

### 6.1 Authentication
- Email/password login
- GitHub OAuth
- Google OAuth
- Demo mode: any credentials work, data loaded from seed data
- Role-based access: `viewer`, `developer`, `admin`

### 6.2 Project Management
- Create projects via a 6-step guided wizard
- Connect GitHub repository (owner, repo name, branch)
- Select deployment provider (Vercel or Netlify)
- Configure API credentials and webhooks
- View project catalog with status badges

### 6.3 Deployment Tracking
- Real-time deployment status: queued → building → ready / failed / canceled / rolled back
- Build stage progression with per-stage duration
- Terminal-style build log viewer with line numbers and syntax highlighting
- Deployment history table with commit info, author, provider, branch, duration
- Webhook simulation for demo mode

### 6.4 Incident Management
- Automatic incident creation on deployment failure or monitoring alert
- GitGuardian-style list view with tab filters: All | Open | Critical | Investigating | Resolved
- Split-panel detail view with 4 tabs: Overview | Locations | Feedback | Activity
- Persistent right sidebar with Resolve ▾ and Ignore ▾ dropdown actions
- AI-generated "How to remediate" checklist in the sidebar
- Comment and feedback system with activity timeline
- Role-based action visibility (viewers cannot resolve or ignore)

### 6.5 Monitoring & Observability
- Unified alert view aggregating Grafana, Datadog, Sentry, Vercel, Netlify signals
- Alert severity badges: critical / high / medium / low / info
- Alert status tracking: firing / resolved / pending / no_data
- Sentry issues tab with stack trace viewer, level pills, release linkage
- Per-deployment "Plugin Signals" panel showing alerts fired ±30 minutes of deployment

### 6.6 Plugin / Integration System
- Plugin Marketplace for discovering and installing integrations
- Supported plugins: GitHub, Vercel, Netlify, Grafana, Datadog, Sentry
- Per-plugin configuration: API key (masked), base URL, webhook URL, project scoping
- Connection test with real-time feedback
- Role enforcement: only admins can install, configure, or remove plugins

### 6.7 Rollback & Recovery
- Controlled rollback workflow with target version selection
- Confirmation step with deployment diff display
- Live rollback progress with audit log streaming
- Auto-resolution of open incidents on successful rollback
- Viewer role cannot trigger rollback

### 6.8 AI Assistance
- Chat-style interface with project/deployment/incident context selector
- Confidence score per analysis
- Root cause breakdown (identified causes list)
- AI-generated remediation step list
- Pre-seeded AI explanations for demo deployments (d201, d501)
- Fallback to generic steps when no AI data exists

### 6.9 Team Management
- Per-project team membership (TeamMember model)
- Roles: viewer (read-only), developer (comment + resolve), admin (full access)
- Invite by email with role assignment
- Role editing and member removal by admin
- Team tab in Project Details and Team Management section in Settings

### 6.10 Dashboard
- 6 metric cards: Total Services, Active Deploys, Failed Deploys, Open Incidents, Firing Alerts, Plugins Active
- Service Health widget: Grafana latest alert value, Sentry unresolved count, Datadog firing count
- Integration Health panel: 6 rows including ArgoCD sync status
- Deployment success rate chart (7-day area chart)
- Incident activity trend chart (7-day line chart)
- Monitoring alert trend chart (7-day stacked bar chart)
- Audit trail feed (scrollable, 400px, all action types)

### 6.11 Notifications
- Per-event notification feed with read/unread tracking
- Types: info, success, warning, error, incident
- Mark individual or all as read
- Click-through to related incident or deployment

---

## 7. User Stories (Summary)

### Phase 1 — Core UI
- US1: Incident list with tab filters, filter chips, search, source badges
- US2: Incident detail split layout with breadcrumb navigation
- US3: 4-tab detail navigation (Overview / Locations / Feedback / Activity)
- US4: Overview tab with incident KV card, build logs terminal, related alerts
- US5: Locations tab with perimeter stats and related deployments table
- US6: Feedback tab with real/false-positive toggle and comment submission
- US7: Activity tab with merged timeline feed and filter buttons
- US8: Right sidebar with resolve/ignore dropdowns, details KV list, AI remediation checklist
- US9: No breaking changes to context actions (resolveIncident, addComment, updateIncident)
- US10: Source plugin column in incident list
- US11: Related alerts section in Overview tab

### Phase 1.5 — Team UX + Plugin Data
- US22: Project-centric dashboard with plugin health metrics
- US23: Monitoring tab in Project Details
- US24: Errors tab in Project Details with expandable Sentry issues
- US25: Infrastructure tab with ArgoCD mock state and manual sync trigger
- US26: Team tab with invite/edit/remove (admin only)
- US27: Plugin Signals panel on Deployment Details
- US28: ArgoCD row in Dashboard Integration Health panel
- US29: Service Health widget on Dashboard
- US30: Sentry release linkage in Deployment Details
- US31: Team Management section in Settings
- US32: Role-based UI enforcement across Incidents, Integrations, PluginConfig, RollbackRecovery

### Phase 2 — Real Backend (Spec Ready)
- US12–US21: Real auth, deployment persistence, webhook ingestion, incident CRUD, real rollback, real AI, real plugin sync, audit log persistence, real notifications, ArgoCD GitOps

---

## 8. Functional Requirements

| ID | Requirement | Priority |
|----|-------------|----------|
| FR-01 | Users can log in with email, GitHub, or Google OAuth | Must Have |
| FR-02 | Users can create and manage projects via a guided wizard | Must Have |
| FR-03 | Deployment status updates via webhook or simulation | Must Have |
| FR-04 | Incidents are created automatically on deployment failure | Must Have |
| FR-05 | Incidents have a full detail view with 4 tabs and right sidebar | Must Have |
| FR-06 | Users can resolve or ignore incidents via dropdown actions | Must Have |
| FR-07 | AI-generated remediation steps appear in the right sidebar | Must Have |
| FR-08 | Rollback requires confirmation and creates an audit record | Must Have |
| FR-09 | Plugins can be installed, configured, tested, and removed | Must Have |
| FR-10 | Monitoring alerts from Grafana/Datadog/Sentry are surfaced | Must Have |
| FR-11 | Team members can be invited and assigned roles per project | Must Have |
| FR-12 | Viewer role cannot resolve incidents, trigger rollbacks, or configure plugins | Must Have |
| FR-13 | Admin role is required to install/remove plugins and configure credentials | Must Have |
| FR-14 | Dashboard shows Service Health widget and ArgoCD integration row | Should Have |
| FR-15 | Project Details has 6 tabs: Overview, Deployments, Monitoring, Errors, Infrastructure, Team | Should Have |
| FR-16 | Deployment Details shows Plugin Signals (alerts ±30 min, Sentry release issues) | Should Have |
| FR-17 | Platform works fully offline in demo mode using seed data | Must Have |
| FR-18 | All rollback operations create immutable audit log entries | Must Have |
| FR-19 | Provider credentials are never stored in frontend state or localStorage | Must Have |

---

## 9. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-01 | TypeScript strict mode passes with 0 errors (`tsc && vite build`) |
| NFR-02 | Production build completes in under 60 seconds |
| NFR-03 | All pages render correctly on 1280px+ screens |
| NFR-04 | Rollback confirmation is always required — no autonomous destructive actions |
| NFR-05 | Demo mode is fully functional with no network requests |
| NFR-06 | State persists across page refresh via localStorage |
| NFR-07 | Color contrast meets WCAG AA for critical UI elements |
| NFR-08 | No TypeScript `any` casts without justifying comment (except legacy context casts) |
| NFR-09 | Phase 2 backend deployable to Kubernetes via ArgoCD GitOps model |
| NFR-10 | Webhook processing is idempotent — duplicate events do not create duplicate incidents |

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Project onboarding time | < 10 minutes |
| TypeScript errors on build | 0 |
| Demo mode completeness | 100% of pages functional offline |
| Rollback audit coverage | 100% of operations logged |
| Role enforcement coverage | 100% of destructive actions role-gated |
| Build time | < 60 seconds |

---

## 11. Out of Scope (v1)

- Full multi-cloud orchestration beyond Vercel/Netlify
- Unrestricted autonomous remediation
- Advanced anomaly detection / ML-based alerting
- Enterprise billing integration
- Complete Kubernetes management for user applications
- Mobile app
- SAML/SSO enterprise authentication
