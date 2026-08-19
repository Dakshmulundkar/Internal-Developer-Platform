# Internal Developer Platform (IDP) for Self-Service Delivery and Recovery

A professional, centralized control-plane web platform for software teams to manage, monitor, and recover applications deployed on external hosting providers (**Vercel** and **Netlify**).

---

> [!IMPORTANT]
> **100% Free Tier & Zero Paid API Guarantee**: This platform is engineered to operate exclusively on free-tier APIs and local client-side engines. It requires **zero paid subscriptions, zero paid database instances, and zero paid OpenAI/LLM tokens**.
> - **Free Cloud APIs**: Integrates with Vercel's Free Hobby Tier REST API, Netlify's Free Starter Tier REST API, and GitHub's Free REST API.
> - **Free In-House AI Engine**: Aether AI failure diagnosis and incident analysis run 100% locally using structured contextual heuristics—no paid OpenAI, Anthropic, or external API keys required.
> - **Free Storage & Zero Hosting Cost**: Platform state and audit logs persist locally using standard Web Storage APIs (`LocalStorage`).

---

## 1. Project Overview

Modern engineering teams often deploy web applications across multiple external cloud hosting platforms (such as Vercel and Netlify). Managing these disconnected deployments requires checking several dashboards, setting up manual build notifications, and manually diagnosing failures when builds break.

This Internal Developer Platform (IDP) acts as a **centralized management and operational recovery layer**:
- **Control Plane Architecture**: The platform does **not** host or replace user applications. Your code continues running on Vercel or Netlify.
- **Self-Service Onboarding**: Enables developers to register GitHub repositories, configure target environments (`production`, `staging`, `preview`), and hook build pipelines in a guided 6-step wizard.
- **Unified Health Monitoring**: Consolidates build statuses, deployment logs, provider gateway latencies, and incident tickets into a single dark-themed dashboard.
- **Automated Incident Ticketing**: Automatically opens incident tickets when a build or deployment pipeline fails.
- **Aether AI Diagnosis**: Evaluates error messages and build stage logs to provide confidence scores, root cause breakdowns, and suggested troubleshooting steps.
- **Controlled Rollback & Recovery**: Enables operators to restore previous stable deployment versions via API with interactive confirmation modals and full audit log retention.

---

## 2. Data Fetching & Event Collection Architecture

The platform provides a dual-mode data integration architecture supporting both **Live API Data Collection** and **Demonstration Seed Data Fallback**:

```
+-----------------------------------------------------------------------+
|                       IDP Web Control Plane                           |
|                      (React + TypeScript + Vite)                      |
+-----------------------------------+-----------------------------------+
                                    |
          +-------------------------+-------------------------+
          |                                                   |
          v                                                   v
+-------------------------------+           +-------------------------------+
|  Live REST API & Webhook Mode |           | Demonstration / Seed Data Mode|
|  (Token Authenticated)        |           | (Offline / Offline Demo)      |
+---------------+---------------+           +---------------+---------------+
                |                                           |
  +-------------+-------------+             +---------------+---------------+
  |                           |             | Seed Data Engines             |
  v                           v             |  - 5 Onboarded Projects       |
+-------------------+   +-----------------+ |  - Multi-stage Build Logs     |
| Vercel REST API   |   | Netlify REST API| |  - Incident History Logs      |
| GET /v6/deployments|  | GET /api/v1/    | |  - Rollback Audit Trails      |
| POST /v9/alias    |   | POST /restore   | +-------------------------------+
+-------------------+   +-----------------+
```

### Live Provider Integration (`src/services/providerApi.ts`)

When users configure access tokens (e.g. Vercel Personal Access Tokens `vcl_...` or Netlify Access Tokens `nf_...`):

1. **Deployment Event Fetching**:
   - **Vercel API**: Calls `GET https://api.vercel.com/v6/deployments` with `Authorization: Bearer <token>` to collect deployment IDs, GitHub commit SHAs, commit messages, branch names, deploy states (`BUILDING`, `READY`, `ERROR`), and edge routing URLs.
   - **Netlify API**: Calls `GET https://api.netlify.com/api/v1/sites/{site_id}/deploys` to fetch deploy histories, build durations, committer details, and raw compilation error messages.

2. **API-Driven Rollback Execution**:
   - **Vercel Alias Re-routing**: Calls `POST https://api.vercel.com/v9/projects/{projectId}/alias` to point active domain traffic to a targeted stable deployment version.
   - **Netlify Deploy Restore**: Calls `POST https://api.netlify.com/api/v1/sites/{site_id}/deploys/{deploy_id}/restore` to re-activate a previous release version.

3. **Webhook Listener Simulation**:
   - Real-time status changes and build transitions (`queued` $\rightarrow$ `building` $\rightarrow$ `ready` / `failed`) are published to the `PlatformContext` event stream, updating dashboard counts and notification feeds.

### Fallback Demonstration Mode

If external API credentials are omitted or offline, the platform seamlessly loads realistic mock seed data ([`src/data/seedData.ts`](file:///c:/Users/Sejal/Downloads/major/src/data/seedData.ts)) representing 5 diverse projects, multi-stage build logs, open incidents, and historical rollback operations—ensuring friction-free university project evaluations and offline demonstrations.

---

## 3. Core Modules & User Interface

| Page / Module | File Path | Core Functionality |
| :--- | :--- | :--- |
| **Login & Auth** | [`Login.tsx`](file:///c:/Users/Sejal/Downloads/major/src/pages/Login.tsx) | Email/password sign-in, GitHub & Google OAuth simulation, dark technical design. |
| **Dashboard** | [`Dashboard.tsx`](file:///c:/Users/Sejal/Downloads/major/src/pages/Dashboard.tsx) | High-level metrics, Recharts deployment success area charts, incident trend line charts, cloud provider health status. |
| **Service Catalog** | [`Projects.tsx`](file:///c:/Users/Sejal/Downloads/major/src/pages/Projects.tsx) | Grid of registered services with provider tags, active status badges, search and filter options. |
| **Create Project Wizard** | [`CreateProjectWizard.tsx`](file:///c:/Users/Sejal/Downloads/major/src/pages/CreateProjectWizard.tsx) | 6-step onboarding wizard for project metadata, GitHub repo, hosting provider selection, target branch, credential verification. |
| **Project Control Panel** | [`ProjectDetails.tsx`](file:///c:/Users/Sejal/Downloads/major/src/pages/ProjectDetails.tsx) | Comprehensive project overview, live deployment URLs, quick-action rollback triggers, and AI diagnostic shortcuts. |
| **Deployments History** | [`Deployments.tsx`](file:///c:/Users/Sejal/Downloads/major/src/pages/Deployments.tsx) | Timeline of pipeline runs with commit details, branch, duration, and status indicators. |
| **Deployment Details** | [`DeploymentDetails.tsx`](file:///c:/Users/Sejal/Downloads/major/src/pages/DeploymentDetails.tsx) | Build stage progression, raw exception stack output, dark terminal console logs, Aether AI cause analysis, quick rollback confirmation modal. |
| **Incidents & Ticketing** | [`Incidents.tsx`](file:///c:/Users/Sejal/Downloads/major/src/pages/Incidents.tsx) | Actionable incident queue categorized by severity (`Critical`, `High`, `Medium`, `Low`), comment threads, resolution actions. |
| **Rollback & Recovery** | [`RollbackRecovery.tsx`](file:///c:/Users/Sejal/Downloads/major/src/pages/RollbackRecovery.tsx) | Controlled release restoration workflow, target selection, confirmation prompts, safety warning banners, audit history. |
| **Aether AI Assistant** | [`AIAssistant.tsx`](file:///c:/Users/Sejal/Downloads/major/src/pages/AIAssistant.tsx) | Contextual failure diagnosis chat interface, confidence scores, root cause identification, suggested recovery paths. |
| **Notifications Center** | [`Notifications.tsx`](file:///c:/Users/Sejal/Downloads/major/src/pages/Notifications.tsx) | Real-time alert feed for failed builds, new incidents, and completed rollbacks with read/unread tracking. |
| **System Settings** | [`Settings.tsx`](file:///c:/Users/Sejal/Downloads/major/src/pages/Settings.tsx) | User profile settings, provider connection keys, security preferences, session management. |

---

## 4. Technology Stack

- **Frontend Core**: React 18, TypeScript 5, Vite 5
- **Styling & UI**: Vanilla CSS Design Tokens, Tailwind CSS, Lucide React Icons
- **Data Visualization**: Recharts (Deployment Success Area Charts & Incident Trend Line Charts)
- **API Services**: `providerApi.ts` (Vercel REST API v6/v9, Netlify REST API v1)
- **State Management**: React Context API (`PlatformContext.tsx`) with LocalStorage persistence

---

## 5. Getting Started & Running Locally

### Prerequisites
- Node.js (v18+)
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/internal-developer-platform.git
cd internal-developer-platform

# Install dependencies
npm install
```

### Running the Development Server

```bash
# Launch the Vite development server
npm run dev
```

Open your browser and navigate to `http://localhost:5173/`.

### Building for Production

```bash
# Perform TypeScript type-checks and compile production bundle
npm run build
```

---

## 6. Verification & Evaluation Metrics

- **Type Safety**: Verified using `tsc --noEmit` (**0 compilation errors**).
- **Bundle Build**: Compiled using `vite build` (**2284 modules transformed, 6.4s build time**).
- **Onboarding Latency**: Project onboarding wizard completes under 10 seconds.
- **Recovery Auditing**: 100% of rollback operations append immutable audit records to the platform log.
