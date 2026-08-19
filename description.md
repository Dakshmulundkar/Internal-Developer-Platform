# Design and Implementation of an Internal Developer Platform for Self-Service Delivery and Recovery

## 1. Project Overview

This project proposes an Internal Developer Platform (IDP) that acts as a unified control and management layer for software projects. The platform is designed for developers and operations teams who currently use several disconnected tools for source code, deployments, monitoring, incidents, security checks, and recovery.

The platform does **not** replace the user's hosting provider. Users continue deploying their applications on free external services such as Vercel or Netlify. The IDP connects to these services through APIs and webhooks and provides a centralized interface for project onboarding, deployment tracking, monitoring, incident handling, rollback, recovery workflows, and notifications.

The main purpose is to reduce repetitive setup, improve visibility, and provide a structured way to respond when a build or deployment fails. The platform combines self-service workflows with operational automation and AI-assisted explanations, while keeping important recovery actions controlled and auditable.

## 2. Problem Statement

Modern software teams use multiple tools for repositories, builds, deployments, monitoring, security, and incident communication. Because these tools are separated, developers may need to configure each project manually, check several dashboards, and investigate deployment failures without a common workflow.

This creates inconsistent setups, slower troubleshooting, poor visibility into application health, and difficulty recovering from failed releases. A unified platform is therefore required to provide self-service delivery, centralized monitoring, incident management, and safe recovery for projects deployed on external hosting platforms.

## 3. Proposed Solution

The IDP provides a web portal where users can:

- Register and authenticate securely.
- Create and manage projects.
- Connect a GitHub repository.
- Select a deployment provider such as Vercel or Netlify.
- Configure provider credentials and webhooks.
- View build and deployment status.
- Monitor deployment history and application health.
- Receive alerts for failed or risky deployments.
- Open and manage incident tickets.
- View AI-generated explanations and suggested actions.
- Start a controlled rollback to a previous successful deployment.
- Track recovery progress and maintain an audit trail.

The platform works as a control plane. The application remains deployed on the user's selected hosting provider, while the IDP collects events, displays operational information, and coordinates recovery actions.

## 4. Main Workflow

1. The user signs in to the platform.
2. The user creates a project.
3. The user connects a GitHub repository.
4. The user selects Vercel or Netlify.
5. The backend stores the provider configuration securely.
6. The platform registers the required APIs and webhooks.
7. A code push starts the normal build and deployment process.
8. The provider sends build and deployment events to the IDP.
9. The backend validates and stores these events.
10. The dashboard updates the deployment status.
11. Monitoring rules detect failures or risky conditions.
12. The incident module creates a ticket.
13. The user receives a notification.
14. The AI assistant analyzes the deployment context.
15. The assistant explains the likely cause and suggests actions.
16. The user can retry, investigate, or initiate a rollback.
17. The platform restores a previous successful deployment through the provider API.
18. The rollback result and audit information are stored.

## 5. Core Modules

### User and Authentication
- User registration and login.
- GitHub and Google OAuth.
- Email authentication.
- Role-based permissions.
- Session and account management.

### Project and Service Catalog
Stores: project name, repository details, deployment provider, environment, current status, project owner, deployment history.

### Repository Integration
Connects the IDP with GitHub repositories and manages: repository selection, branch configuration, commit information, pull-request events, webhook registration.

### Deployment Provider Integration
Connects to Vercel and Netlify using APIs and webhooks. Retrieves: build status, deployment status, deployment URL, commit information, error details, available deployment versions.

### Deployment Monitoring
Displays deployment states: Queued, Building, Ready, Failed, Canceled, Rolled back. Users can filter deployments by project, provider, branch, environment, and date.

### Incident and Ticketing
Creates incidents when configured failure conditions occur. Each incident contains: project, severity, provider, error details, timeline, assigned user, status, suggested action, resolution history.

### Recovery and Rollback
Provides a controlled way to restore a previous stable deployment. The rollback workflow:
- Lists successful deployments.
- Allows the user to select a stable version.
- Requires confirmation.
- Calls the provider API.
- Monitors the rollback result.
- Records the complete audit history.

### AI Assistance
The AI assistant can:
- Summarize deployment failures.
- Explain error messages.
- Identify possible causes.
- Recommend recovery actions.
- Summarize incident timelines.
- Suggest troubleshooting steps.

The AI does **not** perform destructive actions automatically. Rollback and recovery operations require user confirmation.

### Notifications
Notifications for: failed builds, failed deployments, new incidents, rollback completion, unresolved incidents, provider connection errors.

### Security and Audit
- Secure token storage.
- Webhook signature validation.
- Role-based access control.
- Audit logs.
- Input validation.
- Secure environment variables.
- Permission-based rollback access.

## 6. System Architecture

```
+-----------------------------+
| Users                       |
| Developers / Administrators |
+--------------+--------------+
               |
               v
+-----------------------------+
| Web Portal                  |
| React + TypeScript          |
+--------------+--------------+
               |
               v
+-----------------------------+
| Authentication and RBAC     |
| JWT / OAuth                 |
+--------------+--------------+
               |
               v
+-----------------------------+
| Backend API                 |
| Projects                    |
| Deployments                 |
| Incidents                   |
| Rollback                    |
| AI Assistance                |
+------+------------+---------+
       |            |
       v            v
+-------------+ +----------------+
| PostgreSQL  | | AI Assistant   |
| Platform DB | | LLM + Context  |
+-------------+ +----------------+
       |
       v
+-----------------------------+
| Integration Layer            |
| GitHub APIs / Webhooks       |
| Vercel APIs / Webhooks       |
| Netlify APIs / Webhooks      |
+--------------+--------------+
               |
               v
+-----------------------------+
| User Deployment Platforms    |
| Vercel / Netlify              |
+--------------+--------------+
               |
               v
+-----------------------------+
| Events, Status, Logs, URLs   |
+-----------------------------+
      |       |       |
      v       v       v
  Dashboard Incidents Notifications
                         |
                         v
                    Rollback Flow
```

## 7. Technology Stack and Tools

### Frontend
- React
- TypeScript
- Vite or Next.js
- Tailwind CSS
- Recharts or Chart.js
- React Router
- WebSockets or Server-Sent Events

### Backend
- Python
- FastAPI
- REST APIs
- WebSockets or Server-Sent Events
- Pydantic
- Background tasks

### Database
- Supabase PostgreSQL
- Supabase Storage (if required)
- Redis (optional, for caching and queues)

### Authentication
- Supabase Auth or JWT
- GitHub OAuth
- Google OAuth
- Email and password authentication
- Role-based access control

### Integrations
- GitHub API
- GitHub Webhooks
- Vercel API and Webhooks
- Netlify API and Webhooks

### AI and Automation
- LLM API
- Structured prompts
- Retrieval-Augmented Generation
- Incident summarization
- Failure explanation
- Recovery recommendations

### Monitoring and Visualization
- Deployment event tracking
- Build and deployment status monitoring
- Recharts or Chart.js
- In-app alerts
- Incident dashboards
- Optional Prometheus and Grafana

### Security
- HTTPS
- Webhook signature validation
- Encrypted provider tokens
- Role-based permissions
- Rate limiting
- Audit logs
- Environment variables for secrets

### Development and Deployment
- GitHub
- GitHub Actions
- Docker
- Vercel or Netlify for frontend hosting
- Render or Railway for backend hosting (if required)
- Supabase for database and authentication

## 8. Main Database Entities

- User
- Role
- Project
- Repository
- Deployment Provider
- Environment
- Deployment
- Build Event
- Webhook Event
- Incident
- Incident Comment
- Rollback Operation
- Notification
- AI Analysis
- Audit Log

## 9. Functional Requirements

- Users shall be able to create accounts and log in securely.
- Users shall be able to create and manage projects.
- Users shall be able to connect GitHub repositories.
- Users shall be able to connect Vercel or Netlify projects.
- The system shall receive and validate provider webhooks.
- The system shall display build and deployment statuses.
- The system shall maintain deployment history.
- The system shall generate incidents for configured failures.
- The system shall notify users about important events.
- The system shall provide AI explanations and recommendations.
- Users shall be able to roll back to a previous successful deployment.
- The system shall record rollback and audit information.

## 10. Non-Functional Requirements

- The interface should be simple for developers.
- Deployment updates should appear with minimal delay.
- Provider credentials must not be exposed in the frontend.
- Failed webhook processing should support safe retries.
- Duplicate incidents should be avoided.
- Rollback actions should require confirmation.
- The platform should remain usable during temporary provider failures.
- Important actions should be traceable through audit logs.

## 11. Recovery and Rollback Design

Recovery is implemented as a controlled workflow rather than unrestricted automation. The platform identifies the affected project and failed deployment, gathers available context, and informs the user.

The AI assistant suggests a possible action, but the user decides whether to retry, investigate, or roll back. For rollback, the platform lists earlier successful deployments and allows the user to select a stable version.

The backend verifies the selected deployment, calls the relevant provider API, monitors the rollback result, and updates the incident. If the rollback fails, the platform records the failure and notifies the user instead of repeatedly executing the action.

## 12. Evaluation Metrics

- Project onboarding time.
- Provider connection time.
- Webhook processing latency.
- Deployment status accuracy.
- Incident creation accuracy.
- Mean time to acknowledge an incident.
- Mean time to recover.
- Rollback success rate.
- Duplicate alert rate.
- AI explanation usefulness.
- Dashboard response time.
- API error rate.

## 13. Initial Scope and Limitations

The first version focuses on Vercel and Netlify integration. It does not replace these hosting platforms.

The following features are outside the initial scope:
- Full multi-cloud orchestration.
- Unrestricted autonomous remediation.
- Advanced anomaly detection.
- Enterprise billing integration.
- Complete Kubernetes management for user applications.

Kubernetes may be considered for future platform infrastructure, but user applications remain deployed on their selected external hosting provider.

## 14. Expected Outcome

The final system should provide a working developer portal that connects repositories with external deployment platforms, displays deployment health, creates incidents, assists with diagnosis, and supports controlled rollback.

The project demonstrates how an Internal Developer Platform can improve developer experience and operational recovery without requiring users to manage complex infrastructure directly.

---

## Prompt to Generate the Complete Website

Create a complete, professional, responsive web application for a final-year engineering project titled:

**"Design and Implementation of an Internal Developer Platform for Self-Service Delivery and Recovery."**

The application is an Internal Developer Platform that acts as a centralized control and management layer over applications deployed on external hosting platforms such as Vercel and Netlify.

Do not build a hosting platform or Kubernetes deployment system for user applications. Users continue to deploy their applications on Vercel or Netlify. This platform connects to those services through APIs and webhooks and provides project status, monitoring, incidents, AI assistance, and rollback workflows in one dashboard.

### Website Objectives

Build a working dashboard-style web application for developers. It should look like a serious technical platform, not a marketing website.

Prioritize:
- Clear navigation.
- Simple project management.
- Deployment visibility.
- Incident monitoring.
- Rollback control.
- AI-assisted troubleshooting.
- Professional technical design.

### Required Pages

**1. Login and Registration**
- Email and password login.
- GitHub OAuth button.
- Google OAuth button.
- Forgot password link.
- Clean dark technical design.

**2. Main Dashboard**
- Total projects.
- Active deployments.
- Failed deployments.
- Open incidents.
- Recent rollback operations.
- Deployment success chart.
- Incident trend chart.
- Recent activity feed.
- Vercel provider status.
- Netlify provider status.

**3. Projects Page**
- Search and filter projects.
- Project cards or table.
- Project name, repository, provider, branch, environment.
- Current status, last deployment.
- Create project button.

**4. Create Project Wizard** (multi-step form)
- Project name and description.
- GitHub repository selection.
- Vercel or Netlify provider selection.
- Environment selection.
- Production branch.
- API and webhook connection step.
- Review and create step.
- Validation and connection states.

**5. Project Details Page**
- Project overview.
- Current deployment status.
- Deployment URL.
- Repository details.
- Provider information.
- Recent deployments.
- Deployment health.
- Project incidents.
- Rollback button.
- AI analysis button.

**6. Deployments Page**
- Deployment timeline.
- Status badges: Queued, Building, Ready, Failed, Canceled, Rolled back.
- Commit information, branch, author, provider, duration, timestamp.
- Search and filtering.
- Deployment detail navigation.

**7. Deployment Details Page**
- Deployment summary.
- Build stages.
- Error message panel.
- Event timeline.
- Mock deployment logs.
- AI explanation section.
- Retry button.
- Rollback button.
- Rollback confirmation modal.

**8. Incidents Page**
- Incident list: severity, project, provider, status, assigned user, creation time.
- Filters: Open, Investigating, Resolved.
- Incident detail view.
- Incident timeline.
- Comments.
- Suggested actions.
- Resolve incident action.

**9. Rollback and Recovery Page**
- Rollback operation history.
- Selected project.
- Failed deployment.
- Target stable deployment.
- Confirmation step.
- Rollback progress state.
- Success or failure result.
- Audit information.
- Warning that rollback changes the active deployment.

**10. AI Assistant Page**
- Chat-style interface.
- Context selector for project, deployment, or incident.
- Example questions:
  - "Why did this deployment fail?"
  - "Summarize this incident."
  - "What should I check next?"
- Concise explanations.
- Possible cause.
- Confidence indicator.
- Recommended actions.
- Clear notice that AI does not automatically perform destructive actions.

**11. Notifications Page**
- Failed deployment alerts.
- New incident alerts.
- Rollback completion alerts.
- Unresolved incident reminders.
- Read and unread states.

**12. Settings Page**
- User profile.
- Connected GitHub account.
- Connected Vercel account.
- Connected Netlify account.
- Notification preferences.
- Security settings.
- Session management.
- Project permissions.

### Visual Design

- Professional dark dashboard theme.
- Navy, slate, white, and blue accents.
- Red for failures and destructive actions.
- Amber for warnings.
- Green for successful deployments.
- Blue for active states.
- Use cards, tables, tabs, badges, timelines, drawers, modals, charts, and empty states.
- Consistent spacing and typography.
- Hover states, loading skeletons, success/error toasts, confirmation dialogs.
- Responsive layout, accessible color contrast, keyboard-friendly controls.

### Recommended Frontend Stack

- React
- TypeScript
- Vite or Next.js
- Tailwind CSS
- React Router (if using Vite)
- Recharts or Chart.js
- Lucide React icons
- TanStack Query (if supported)

### Backend and Data

If backend support is available, use:
- FastAPI
- REST APIs
- WebSockets or Server-Sent Events
- PostgreSQL or Supabase
- Mock API interfaces that can later be replaced by real APIs

Create realistic seed data for:
- Five projects.
- Successful, failed, building, canceled, and rolled-back deployments.
- Four incidents with different severity levels.
- Rollback history.
- Recent notifications.
- AI analysis examples.
- Vercel provider connection.
- Netlify provider connection.

### Functional Behavior

- Navigation must work across all pages.
- Search, filtering, tabs, and sorting must work.
- Project creation must behave as a multi-step wizard.
- Project details must open from the project list.
- Deployment details must open from deployment lists.
- Incident creation must update dashboard counts.
- Rollback confirmation must update deployment status.
- Rollback must create an audit event.
- AI analysis must show a loading state before displaying results.
- Provider connections must support connected, disconnected, and error states.
- Toast notifications should appear after important actions.
- Use realistic mock integrations if real API credentials are unavailable.
- Do not claim that real Vercel or Netlify APIs are connected unless actual integration is implemented.

### Important Constraints

- Do not build a hosting platform.
- Do not deploy user applications directly from this system.
- Do not replace Vercel or Netlify.
- Do not make rollback fully autonomous.
- Require user confirmation for rollback.
- Keep provider tokens out of the frontend.
- Use mock provider data when real credentials are unavailable.
- Clearly label demonstration data where appropriate.
- Make the final website suitable for a university project demonstration and technical review.
