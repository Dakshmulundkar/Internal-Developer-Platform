# Incidents Page Redesign — Implementation Tasks

> **Order rule:** Complete all Phase 1 (UI) tasks first. Only after the UI is visually complete and verified should Phase 2 (backend) tasks begin. No UI changes permitted during Phase 2.

---

## PHASE 1 — FRONTEND UI REDESIGN

### ✅ Task 1: Update Incident type in platform.ts
**File:** `src/types/platform.ts`
**Changes:**
- Add `ignoredReason?: string` — stores reason when incident is ignored
- Add `feedbackIsReal?: boolean` — stores user's real/false-positive answer
- Add `feedbackComment?: string` — stores user's additional feedback text
- All fields optional, no breaking changes

---

### ✅ Task 2: Add updateIncident action to PlatformContext
**File:** `src/context/PlatformContext.tsx`
**Changes:**
- Add `updateIncident: (incidentId: string, updates: Partial<Incident>) => void` to context interface
- Implement function that patches incident in state and syncs to localStorage
- Add to Provider value object
- This covers: ignore reason, feedback, any future field patches

---

### ✅ Task 3: Add getRemediationSteps utility
**File:** `src/pages/Incidents.tsx` (inline, top of file, outside component)
**Logic:**
```ts
interface RemediationStep {
  icon: LucideIcon
  title: string
  description: string
  isResolveLink?: boolean
}
function getRemediationSteps(deploymentId?: string): RemediationStep[]
```
- Look up `aiExplanations[deploymentId]?.recommendations`
- If found: parse each recommendation into `{ title, description }` by splitting at first `.` or `:`
- Assign Lucide icon per keyword: rollback→RefreshCw, variable/env→Settings, log/check→Search, fix/update→Code, navigate/dashboard→ExternalLink, default→ChevronRight
- Always append resolve step last: `{ icon: CheckCircle, title: 'You can mark the incident as resolved', isResolveLink: true }`
- If nothing found: return 3 generic fallback steps + resolve link

---

### ✅ Task 4: Add relativeTime and openedFor helpers
**File:** `src/pages/Incidents.tsx` (inline)
```ts
function relativeTime(timestamp: string): string
function openedFor(timestamp: string): string
```
- relativeTime: "just now" / "X minutes ago" / "about X hours ago" / "X days ago"
- openedFor: "Less than 1 hour" / "X hours" / "X days" (no "ago")

---

### ✅ Task 5: Rewrite Incidents.tsx — State + List View
**File:** `src/pages/Incidents.tsx`

**5a. New/changed state variables:**
- `listTab: 'all' | 'open' | 'critical' | 'investigating' | 'resolved'` — replaces statusFilter
- `selectedId: string | null` — replaces localActiveId, initialize from activeIncidentId
- `activeTab: 'overview' | 'locations' | 'feedback' | 'activity'` — default 'overview'
- `resolveOpen: boolean` — resolve dropdown visibility
- `ignoreOpen: boolean` — ignore dropdown visibility
- `resolveRef: useRef<HTMLDivElement>(null)` — click-outside ref
- `ignoreRef: useRef<HTMLDivElement>(null)` — click-outside ref
- `feedbackIsReal: boolean | null` — default null
- `feedbackComment: string` — default ''
- `feedbackSubmitted: boolean` — default false
- `activityFilter: 'all' | 'actions' | 'comments'` — default 'all'
- Keep: `searchTerm`, `commentText`

**5b. Filter logic:**
```ts
const filteredIncidents = incidents.filter(inc => {
  const matchSearch = inc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    inc.projectName.toLowerCase().includes(searchTerm.toLowerCase())
  const matchTab =
    listTab === 'all'          ? true :
    listTab === 'open'         ? inc.status === 'open' :
    listTab === 'critical'     ? inc.severity === 'critical' :
    listTab === 'investigating'? inc.status === 'investigating' :
    listTab === 'resolved'     ? inc.status === 'resolved' : true
  return matchSearch && matchTab
})
```

**5c. Tab bar:**
- Tabs: All | Open | Critical | Investigating | Resolved
- "Critical" tab gets a small red dot if any critical incidents exist: `{listTab !== 'critical' && incidents.some(i => i.severity === 'critical') && <span className="w-1.5 h-1.5 rounded-full bg-red-500 ml-1" />}`
- Active: `border-b-2 border-white text-white`
- Inactive: `text-zinc-500 hover:text-zinc-300`

**5d. Filter chips row:**
- Show chip if searchTerm not empty: `Search: "{searchTerm}" ×`
- Show chip if listTab is severity-based: `Severity: Critical ×`
- Columns button on right (decorative): `bg-white/[0.03] border border-white/[0.06] text-zinc-400 text-xs px-3 py-1.5 rounded-md`
- Results count: `{filteredIncidents.length} results / {incidents.length} total`

**5e. Incident table:**
- Full-width: `w-full bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden`
- Header row: `bg-white/[0.02] border-b border-white/[0.06]`
- Column headers: `text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-4 py-3`
- Columns: □ | TITLE | SEVERITY | SOURCE | INFO | TAGS | STATUS
- Row: `group hover:bg-white/[0.02] transition-colors cursor-pointer border-b border-white/[0.06] last:border-0`
- Checkbox cell: `opacity-0 group-hover:opacity-100 transition-opacity`
- Title cell: incident.title in `text-xs font-medium text-zinc-200 group-hover:text-white` + projectName below in `text-[10px] text-zinc-600 font-mono`
- Severity: pill badge
- Source: badge from `incident.provider` (NF/VC/GF/DD/SN colored per design.md)
- Info: projectName + assignedTo below
- Tags: derived tag pills
- Status: pill badge
- On row click: `setSelectedId(inc.id)` and `setActiveTab('overview')`

---

### ✅ Task 6: Build Incident Detail — Shell + Tabs
**File:** `src/pages/Incidents.tsx`
**Condition:** `selectedId !== null`

**6a. Top bar:**
```
← Back to incidents    Incidents  /  {incident.title}
```
- Back button: `setSelectedId(null)` + `setActiveTab('overview')` + `setFeedbackSubmitted(false)`
- Breadcrumb: `Incidents` + slash + incident title (truncated at 50 chars)

**6b. Title row:**
- `text-xl font-semibold text-white tracking-tight`
- Provider badge inline: small colored pill

**6c. 4-tab bar:**
- `Overview` | `Locations` | `Feedback` | `Activity`
- Same styling as list tab bar
- Tab click sets `activeTab` — does NOT touch sidebar state

**6d. Split layout:**
- `flex gap-6 items-start mt-4`
- Left: `flex-1 min-w-0 space-y-4`
- Right: `w-80 shrink-0 sticky top-0 space-y-4`

---

### ✅ Task 7: Overview Tab
**When `activeTab === 'overview'`:**

**7a. Incident Details card:**
- `bg-white/[0.03] border border-white/[0.06] rounded-xl p-5`
- Title: "Incident Details" uppercase tracking-wider
- KV rows (see data mapping in design.md)
- Error field: `text-red-400`

**7b. Deployment logs terminal:**
- Only render if `deployment?.logs` exists
- Terminal header: Terminal icon + "Build Logs" + version badge
- Log body: `max-h-64 overflow-y-auto` + line numbers + colored log lines
- Error detection: `log.includes('error') || log.includes('Error') || log.includes('!!!')` → `text-red-400`
- Success detection: `log.includes('✓') || log.includes('success')` → `text-emerald-400`
- Below terminal: two buttons — "Inspect Full Logs" + "Initiate Rollback"

**7c. Related Alerts section:**
- Only render if `monitoringAlerts.some(a => a.incidentId === incident.id)`
- Title: "Related Alerts"
- Each alert: source badge + severity + title + value/threshold + firedAt
- Click navigates to `monitoring` page

---

### ✅ Task 8: Locations Tab
**When `activeTab === 'locations'`:**

**8a. Impacted Perimeter stats:**
- `grid grid-cols-3 gap-3`
- Box 1: "Failed Deployments" — `deployments.filter(d => d.projectId === incident.projectId && d.status === 'failed').length`
- Box 2: "Occurrences" — `incident.timeline.length`
- Box 3: "Open Incidents" — `incidents.filter(i => i.projectId === incident.projectId && i.status !== 'resolved').length`

**8b. Related Deployments table:**
- Title: "Related Deployments"
- Columns: `DATE` | `AUTHOR` | `COMMIT` | `STAGE FAILED` | `STATUS`
- Data: `deployments.filter(d => d.projectId === incident.projectId)` sorted newest first
- Stage failed: `deploy.stages?.find(s => s.status === 'failed')?.name || '—'`
- Row click: `navigateTo('deployment-details', { deploymentId: deploy.id })`
- Empty state if no deployments

---

### ✅ Task 9: Feedback Tab
**When `activeTab === 'feedback'`:**

**9a. Is this real toggle:**
- Question: "Is this a real incident?"
- Two buttons: "Yes, it's real" | "It's a false positive"
- Selected state: `bg-white text-black font-medium`
- Unselected: `bg-white/[0.03] text-zinc-400 border border-white/[0.06] hover:bg-white/5`
- Clicking sets `feedbackIsReal`

**9b. Comment textarea + submit:**
- Label: "Additional comment"
- textarea: `rows={4}`, placeholder with @ mention hint
- Submit button: `bg-white text-black hover:bg-zinc-200`
- On submit:
  1. If `feedbackComment.trim()`: call `addComment(incident.id, feedbackComment)`
  2. Call `updateIncident(incident.id, { feedbackIsReal, feedbackComment })`
  3. Set `feedbackSubmitted(true)`, clear `feedbackComment`
- Success message: `bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs p-3 rounded` — show if `feedbackSubmitted`

---

### ✅ Task 10: Activity Tab
**When `activeTab === 'activity'`:**

**10a. Filter buttons:**
- `All` | `Actions` | `Comments`
- Active: `bg-white/5 text-zinc-200 border border-white/[0.06]`
- Inactive: `text-zinc-500 hover:text-zinc-300`

**10b. Comment input:**
- Textarea + Submit button (same pattern as Feedback tab)
- On submit: `addComment(incident.id, commentText)` + clear input

**10c. Timeline feed:**
- Merge `incident.timeline` + `incident.comments` into `ActivityItem[]` sorted ascending
- Apply `activityFilter`
- Each item rendered in `relative` positioned container with connector line
- Timeline event: icon (per type) + event text + relative timestamp
- Comment event: user avatar + name + content + relative timestamp
- Connector: `absolute left-3 top-6 bottom-0 w-px bg-white/[0.06]`

---

### ✅ Task 11: Right Sidebar — Status, Resolve, Ignore
**Always visible in detail view:**

**11a. Status badge:**
- Large badge matching incident.status color
- Text: `incident.status.toUpperCase()`

**11b. Resolve dropdown:**
- Trigger button: `bg-white text-black text-xs font-medium px-3 py-1.5 rounded-md flex items-center gap-1.5`
- Options: "I confirmed and fixed the issue" | "I confirmed and this is not fixable now" | "Rolling back resolves this"
- Selecting: `resolveIncident(incident.id)` + `setResolveOpen(false)` + `setSelectedId(null)`
- Dropdown: `absolute top-full left-0 mt-1 w-64 bg-[#0a0a0a] border border-white/[0.06] rounded-lg z-30`
- `ref={resolveRef}` for click-outside

**11c. Ignore dropdown:**
- Trigger button: `bg-zinc-900 text-zinc-300 border border-white/[0.06] text-xs font-medium px-3 py-1.5 rounded-md`
- Options: "This is a test deployment" | "This is a known flaky issue" | "This is not a real incident (false positive)" | "This deployment is deprecated"
- Selecting: `updateIncident(id, { ignoredReason: option, status: 'resolved' })` + close
- `ref={ignoreRef}` for click-outside

**11d. Click-outside useEffect:**
```ts
useEffect(() => {
  const handler = (e: MouseEvent) => {
    if (resolveRef.current && !resolveRef.current.contains(e.target as Node)) setResolveOpen(false)
    if (ignoreRef.current && !ignoreRef.current.contains(e.target as Node)) setIgnoreOpen(false)
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [])
```

---

### ✅ Task 12: Right Sidebar — Details Key-Value List
**Below the action buttons:**

Rows in order: Assignee | Occurred | Detected | Opened for | Severity | Provider | Tags | Developer
- Each row: `flex justify-between items-center py-2.5 border-b border-white/[0.06] last:border-0 text-xs`
- Label: `text-zinc-500`
- Value: `text-zinc-200`
- Severity/Status values: use badge components
- Tags row: badges + decorative `+` button

---

### ✅ Task 13: Right Sidebar — How to Remediate
**Bottom of right sidebar:**

- Title: "How to remediate" uppercase tracking-wider
- `getRemediationSteps(incident.deploymentId)` — from Task 3
- Each step: icon container + title + description
- Last step (isResolveLink): title in `text-blue-400 hover:underline cursor-pointer`, clicking calls `resolveIncident` + `setSelectedId(null)`

---

### ✅ Task 14: Verify and test all interactions
**No code changes — verification only:**
- [x] List tabs filter correctly
- [x] Filter chips appear and are dismissible
- [x] Clicking a row opens detail view
- [x] Back button returns to list
- [x] All 4 tabs switch without losing sidebar state
- [x] Resolve dropdown closes on outside click
- [x] Ignore dropdown closes on outside click
- [x] Resolve via dropdown marks incident resolved and returns to list
- [x] Ignore via dropdown marks incident resolved with reason
- [x] Activity tab submit adds comment and shows in feed
- [x] Feedback tab submit records feedback
- [x] Remediation resolve link calls resolveIncident
- [x] Navigating here from another page with activeIncidentId opens correct incident
- [x] Dashboard incident count updates after resolving
- [x] No TypeScript errors in diagnostics

---

## PHASE 1.5 — SINGLE-PROJECT TEAM UX + PLUGIN DATA DISPLAY

> These tasks extend the existing UI to surface plugin data (Grafana, Datadog, Sentry, ArgoCD) in the right places and add team management. No backend required — all data comes from existing seed data and new mock seed entries.
> Start Phase 1.5 only after Phase 1 (Tasks 1–14) is complete and visually verified.

---

### ⬜ Task 43: Add new types to platform.ts
**File:** `src/types/platform.ts`
**Changes:**
- Add `ProjectRole` type: `'viewer' | 'developer' | 'admin'`
- Add `TeamMember` interface:
  ```ts
  interface TeamMember {
    id: string
    userId: string
    name: string
    email: string
    avatarUrl?: string
    role: ProjectRole
    projectId: string
    addedAt: string
    addedBy: string
  }
  ```
- Add `ArgoCDAppStatus` interface:
  ```ts
  interface ArgoCDAppStatus {
    appName: string
    syncStatus: 'Synced' | 'OutOfSync' | 'Degraded' | 'Unknown'
    healthStatus: 'Healthy' | 'Progressing' | 'Degraded' | 'Suspended'
    currentImageTag: string
    lastSyncedAt: string
    repoUrl: string
    targetRevision: string
    namespace: string
  }
  ```
- Export both new types

---

### ⬜ Task 44: Add seed data for TeamMembers and ArgoCD status
**File:** `src/data/seedData.ts`
**Changes:**
- Add `mockArgoCDStatus: ArgoCDAppStatus` export with `syncStatus: 'Synced'`, `currentImageTag: 'a1b2c3d'`
- Add `initialTeamMembers: TeamMember[]` export with 3 members: Daksh (admin), Sarah Chen (developer), David Kim (developer) — all on project `p1`
- Import new types at the top of the file

---

### ⬜ Task 45: Add TeamMember state + actions to PlatformContext
**File:** `src/context/PlatformContext.tsx`
**Changes:**
- Add `teamMembers: TeamMember[]` state (init from `initialTeamMembers`, persist to `idp_team` localStorage key)
- Add to interface + provider value:
  - `teamMembers: TeamMember[]`
  - `addTeamMember: (member: Omit<TeamMember, 'id' | 'addedAt' | 'addedBy'>) => void`
  - `removeTeamMember: (memberId: string) => void`
  - `updateTeamMemberRole: (memberId: string, role: ProjectRole) => void`
- Each action appends an audit log entry

---

### ⬜ Task 46: Dashboard — Service Health Widget + ArgoCD row
**File:** `src/pages/Dashboard.tsx`
**Changes:**
- Add `sentryIssues` to context destructure (already in context via `initialSentryIssues`)
- Import `mockArgoCDStatus` and `initialSentryIssues` from seedData
- Add **Service Health** card above the Integration Health panel (new top-right card):
  - 3 mini-stat boxes: Grafana (latest alert value) | Sentry (unresolved count + new today) | Datadog (firing monitor count)
  - Each box clickable → `navigateTo('monitoring')`
- Update Integration Health panel — add ArgoCD as a 6th row:
  ```
  { name: 'ArgoCD', status: 'synced', detail: `Image: ${mockArgoCDStatus.currentImageTag} • Sync: 2m ago` }
  ```
  - Status badge: `synced`=emerald, `out_of_sync`=amber, `degraded`=red

---

### ⬜ Task 47: ProjectDetails — 6-Tab Navigation Shell
**File:** `src/pages/ProjectDetails.tsx`
**Changes:**
- Add local state: `activeTab: 'overview' | 'deployments' | 'monitoring' | 'errors' | 'infrastructure' | 'team'` default `'overview'`
- Add tab bar below project title row: `[Overview][Deployments][Monitoring][Errors][Infrastructure][Team]`
- Tab bar style: `flex border-b border-white/[0.06] mb-4` — active = `border-b-2 border-white text-white`, inactive = `text-zinc-500 hover:text-zinc-300`
- Wrap existing content: overview card + incidents panel → `activeTab === 'overview'`, deployment history table → `activeTab === 'deployments'`
- Destructure `monitoringAlerts`, `teamMembers`, `addTeamMember`, `removeTeamMember`, `updateTeamMemberRole` from context

---

### ⬜ Task 48: ProjectDetails — Monitoring Tab
**When `activeTab === 'monitoring'`:**
- Filter `monitoringAlerts` where `a.projectId === project.id`
- Card: title "Active Alerts" + count badge + "View all →" link → `navigateTo('monitoring')`
- Alert list (up to 8, `max-h-64 overflow-y-auto`):
  - Each row: source badge | severity pill | title | value | relative time
  - Click → `navigateTo('monitoring')`
- Empty state: "No active alerts. Connect Grafana, Datadog, or Sentry in Integrations."

---

### ⬜ Task 49: ProjectDetails — Errors Tab
**When `activeTab === 'errors'`:**
- Import `initialSentryIssues` from seedData, filter where `i.projectId === project.id`
- Card: title "Unresolved Sentry Issues" + count + "Ask AI about all" → `navigateTo('ai-assistant', { projectId })`
- Issue rows (expandable):
  - Collapsed: `[SN]` | level pill | title | `count×` | `[▼]` | `[Ask AI]`
  - Expanded: stack trace block + first/last seen + release + env
  - Level colors: fatal=red, error=orange, warning=amber, info=zinc
  - "Ask AI" → `navigateTo('ai-assistant', { projectId, deploymentId: issue.deploymentId })`
- Empty state: "Sentry not configured or no unresolved issues."

---

### ⬜ Task 50: ProjectDetails — Infrastructure Tab
**When `activeTab === 'infrastructure'`:**
- Import `mockArgoCDStatus` from seedData
- Card: title "Infrastructure" + sync status badge
- KV rows: App Name | Sync Status | Health | Image Tag | Last Synced | Namespace | Repository
- Action buttons: "Trigger Manual Sync" (adds audit log + inline success toast) + "View Rollback History" → `navigateTo('rollback-recovery', { projectId })`
- Demo notice banner: amber `bg-amber-500/5 border border-amber-500/20` — "ArgoCD live data requires Phase 2 backend."

---

### ⬜ Task 51: ProjectDetails — Team Tab
**When `activeTab === 'team'`:**
- Filter `teamMembers` where `tm.projectId === project.id`
- Card: title "Team Members" + count + `[+ Invite Member]` (admin only)
- Members table: MEMBER | EMAIL | ROLE | SINCE | ACTIONS
  - Avatar initials badge (2-char, gradient) | name | email | role badge | date | `[Edit▾][Remove×]`
  - Role badges: admin=`bg-white text-black text-[9px]`, developer=blue, viewer=zinc
  - Edit dropdown: `viewer | developer | admin` → `updateTeamMemberRole`
  - Remove: `window.confirm` → `removeTeamMember`
  - Own row: no edit/remove
- Invite modal (local `showInviteModal` state): email input + role select + `[Send Invite]` → `addTeamMember`
- Role capabilities footnote at bottom

---

### ⬜ Task 52: DeploymentDetails — Plugin Signals Section
**File:** `src/pages/DeploymentDetails.tsx`
**Changes:**
- Add new card below terminal logs: "Plugin Signals Near This Deployment"
- Import `monitoringAlerts` from context, `initialSentryIssues` from seedData
- **Sub-section 1 — Monitoring Alerts (±30 min):**
  - Filter: `|firedAt - deploy.createdAt| < 30 * 60 * 1000`
  - Each row: source badge | severity | title | relative-to-deploy label (`+5 min after` / `-10 min before`) | click → monitoring page
- **Sub-section 2 — Sentry Issues in This Release:**
  - Filter: `release === deployment.version || deploymentId === deployment.id`
  - Each row: level pill | title | `count×` | first seen | `[Ask AI]` → AI assistant
- Empty states for each sub-section when no data

---

### ⬜ Task 53: Settings — Team Management Section
**File:** `src/pages/Settings.tsx`
**Changes:**
- Import `teamMembers`, team actions from context
- Add new card after "User Profile": "Team Management"
- Shows same member table as ProjectDetails Team tab
- `[+ Invite Developer]` button: admin only — opens inline invite form (email + role + submit)
- Each action calls the corresponding context action

---

### ⬜ Task 54: Role-based UI enforcement
**Files:** `src/pages/RollbackRecovery.tsx`, `src/pages/Integrations.tsx`, `src/pages/PluginConfig.tsx`, `src/pages/Incidents.tsx`
**Pattern:**
```ts
const userProjectRole = teamMembers.find(
  tm => tm.projectId === (activeProjectId || projects[0]?.id) && tm.userId === user?.id
)?.role ?? 'admin' // default admin for demo mode / team lead
```
- `RollbackRecovery`: disable rollback button + show tooltip if `userProjectRole === 'viewer'`
- `Integrations`: hide Configure + Remove buttons if not admin
- `PluginConfig`: hide Save button + show read-only notice if not admin
- `Incidents`: hide Resolve/Ignore dropdowns if `userProjectRole === 'viewer'`

---

### ⬜ Task 55: Verify Phase 1.5 interactions
**No code changes — verification checklist:**
- [ ] Dashboard Service Health widget shows 3 plugin stat boxes
- [ ] Dashboard Integration Health shows ArgoCD as 6th row
- [ ] ProjectDetails has 6 tabs, all switch correctly
- [ ] Monitoring tab shows alerts filtered to the project
- [ ] Errors tab shows Sentry issues with expand/collapse and Ask AI
- [ ] Infrastructure tab shows ArgoCD mock KV data
- [ ] "Trigger Manual Sync" adds an audit log entry
- [ ] Team tab shows members with correct role badges
- [ ] Admin can invite, edit role, and remove members
- [ ] Non-admin cannot see Invite/Edit/Remove
- [ ] DeploymentDetails shows Plugin Signals section with both sub-sections
- [ ] Settings shows Team Management section
- [ ] Rollback button disabled for viewer role
- [ ] Integrations Configure/Remove hidden for non-admin
- [ ] No TypeScript errors across all changed files

---

## PHASE 2 — REAL BACKEND INTEGRATION

> Start Phase 2 only after Phase 1 is fully complete, visually verified, and no UI changes are needed.

---

### ⬜ Task 15: Set up FastAPI backend project
**New folder:** `backend/`
- Create `pyproject.toml` with FastAPI, uvicorn, supabase-py, httpx, python-dotenv dependencies
- Create `main.py` with FastAPI app, CORS configured for frontend origin
- Create `config.py` loading env vars: SUPABASE_URL, SUPABASE_KEY, VERCEL_WEBHOOK_SECRET, NETLIFY_WEBHOOK_SECRET, OPENAI_API_KEY, etc.
- Create `database.py` with Supabase client singleton
- Create `.env.example` with all required variable names (no values)
- Add `backend/` to `.gitignore` secrets list
- Test: `uvicorn main:app --reload` starts without errors

---

### Task 16: Supabase database setup
**Supabase dashboard + SQL editor:**
- Run all CREATE TABLE statements from design.md schema
- Enable Row Level Security (RLS) on all tables
- Create RLS policies: users can only read/write their own projects, incidents, etc.
- Enable Supabase Realtime on `incidents`, `notifications`, `deployments` tables
- Set up Supabase Vault for encrypted API key storage
- Test: can insert and query a test project row

---

### Task 17: Real authentication — backend
**File:** `backend/routers/auth.py`
- `POST /auth/register` — create user via Supabase Auth email/password
- `POST /auth/login` — sign in, return JWT
- `POST /auth/logout` — invalidate session
- `GET /auth/me` — return current user from JWT
- Implement `get_current_user` dependency using Supabase JWT verification
- Role stored in `user_metadata` via Supabase Auth admin API

---

### Task 18: Real authentication — frontend
**Files:** `src/context/PlatformContext.tsx`, `src/pages/Login.tsx`, `src/services/api.ts`
- Create `src/services/api.ts` with `api.auth.login()`, `api.auth.register()`, `api.auth.logout()`
- When `VITE_API_URL` env var is set: use real API calls
- When not set: fall through to existing mock loginUser logic (demo mode preserved)
- Store JWT in `localStorage` under `idp_jwt` key (not the user object)
- `loginUser` in context: if API available, call real endpoint and set user from JWT payload

---

### Task 19: Real project CRUD — backend
**File:** `backend/routers/projects.py`
- `GET /projects` — list all projects for current user
- `POST /projects` — create project, store in Supabase
- `GET /projects/{id}` — get single project
- `PATCH /projects/{id}` — update project
- `DELETE /projects/{id}` — delete project

---

### Task 20: Real project CRUD — frontend
**File:** `src/context/PlatformContext.tsx`
- `createProject` function: if API available, POST to `/projects`, get back real UUID, store in context
- `updateProject` function: PATCH to `/projects/{id}`
- Projects list: on app load, fetch from `/projects` if API available, else use seed data

---

### Task 21: Real Vercel webhook receiver
**File:** `backend/webhooks/vercel_webhook.py`
- `POST /webhooks/vercel` endpoint
- Validate `x-vercel-signature` header using HMAC-SHA1
- Parse event type: `deployment.created`, `deployment.succeeded`, `deployment.error`
- Normalize to internal `Deployment` schema
- Store in `deployments` table
- If status = error: call `incident_service.create_from_deployment(deployment_id)`
- Return 200 immediately, process in background task
- Handle duplicate event IDs idempotently

---

### Task 22: Real Netlify webhook receiver
**File:** `backend/webhooks/netlify_webhook.py`
- `POST /webhooks/netlify` endpoint
- Validate `x-netlify-signature` header
- Parse: `deploy_created`, `deploy_succeeded`, `deploy_failed`
- Normalize to internal schema + store
- Auto-create incident if failed

---

### Task 23: Real deployment data fetching
**Files:** `backend/services/vercel_service.py`, `backend/services/netlify_service.py`
- `GET /deployments` — returns deployments from Supabase DB (populated by webhooks)
- `GET /deployments/sync/{projectId}` — manually triggers API poll for latest deployments from provider
- Vercel: `GET https://api.vercel.com/v6/deployments?projectId={id}` with Bearer token
- Netlify: `GET https://api.netlify.com/api/v1/sites/{siteId}/deploys`
- Map provider response to internal schema, upsert to Supabase

---

### Task 24: Real incident persistence — backend
**File:** `backend/routers/incidents.py`
- `GET /incidents` — list incidents for current user's projects
- `GET /incidents/{id}` — get with comments and timeline
- `POST /incidents/{id}/resolve` — update status, set resolved_at, store reason
- `POST /incidents/{id}/ignore` — update with ignored_reason, set status = resolved
- `POST /incidents/{id}/comments` — add comment, append timeline event
- `POST /incidents/{id}/feedback` — store feedbackIsReal + feedbackComment
- `PATCH /incidents/{id}` — generic update

---

### Task 25: Real incident persistence — frontend
**File:** `src/context/PlatformContext.tsx`
- `resolveIncident`: if API available, call `POST /incidents/{id}/resolve`
- `addComment`: if API available, call `POST /incidents/{id}/comments`
- `updateIncident`: if API available, call `PATCH /incidents/{id}`
- On page load: fetch incidents from `/incidents` if API available
- Demo mode fallback: existing localStorage behavior unchanged

---

### Task 26: Real rollback execution — backend
**File:** `backend/routers/rollback.py`
- `POST /rollback` — accepts `{ projectId, targetDeploymentId }`
- Verify target deployment exists and is stable
- Call appropriate provider API:
  - Vercel: `POST /v9/projects/{projectId}/alias` with deploymentId
  - Netlify: `POST /api/v1/sites/{siteId}/deploys/{deployId}/restore`
- Store rollback operation with status = in_progress
- Background task: poll deployment status every 5s until ready or failed
- Update rollback operation status and create notification

---

### Task 27: Real rollback execution — frontend
**File:** `src/pages/RollbackRecovery.tsx`
- `startRollback`: if API available, call `POST /rollback` instead of local simulation
- Poll rollback status via `GET /rollback/{id}` every 3 seconds until complete
- Show real audit logs from backend in the progress panel

---

### Task 28: Real AI analysis — backend
**File:** `backend/services/ai_service.py`, `backend/routers/ai.py`
- `POST /ai/analyze` — accepts incident context (title, description, error_message, logs, alerts)
- Build structured prompt with context
- Call LLM API (OpenAI GPT-4o-mini or Groq Llama3 free tier)
- Parse response into `{ explanation, confidence, causes, steps }`
- Store result in `ai_analyses` table keyed by incident_id
- `GET /ai/analyze/{incidentId}` — return cached analysis if exists

---

### Task 29: Real AI analysis — frontend
**Files:** `src/pages/AIAssistant.tsx`, `src/pages/Incidents.tsx`
- In AIAssistant: if API available, call `POST /ai/analyze` with selected context
- Show real loading state (spinner) while waiting for LLM response
- In Incidents right sidebar: call `GET /ai/analyze/{incidentId}` to get remediation steps
- Fall back to aiExplanations seed data if API not available

---

### Task 30: Real plugin data sync — backend
**Files:** `backend/services/grafana_service.py`, `backend/services/sentry_service.py`, `backend/services/datadog_service.py`
- Background job runs every 5 minutes: for each connected plugin installation, fetch latest data
- Grafana: GET `/api/alerts` from configured base URL with API key
- Sentry: GET `https://sentry.io/api/0/projects/{org}/{project}/issues/`
- Datadog: GET `https://api.datadoghq.com/api/v1/monitor`
- Normalize all to `monitoring_alerts` schema, upsert to Supabase
- Auto-create incidents from critical alerts if no existing open incident for that alert source

---

### Task 31: Real plugin data sync — frontend
**File:** `src/pages/Monitoring.tsx`, `src/pages/Integrations.tsx`
- On Monitoring page load: fetch `GET /monitoring/alerts` from API if available
- On PluginConfig save: call backend to verify connection and trigger first sync
- Plugin status updates in real-time via WebSocket event `plugin.sync_complete`

---

### Task 32: Real-time WebSocket connection
**Files:** `backend/main.py` (WebSocket endpoint), `src/context/PlatformContext.tsx`
- Backend: `WebSocket /ws/{userId}` — accepts connection, sends JSON events
- Frontend: on user login, open WebSocket connection to `VITE_WS_URL`
- Handle events: update relevant context state when events arrive
- Reconnect automatically on disconnect with exponential backoff
- In demo mode (no WS URL): existing timeout-based simulations continue working

---

### Task 33: Real notification persistence
**File:** `backend/routers/notifications.py`
- `GET /notifications` — list user's notifications, sorted by created_at desc
- `PATCH /notifications/{id}/read` — mark as read
- `PATCH /notifications/read-all` — mark all read
- Notifications created server-side by: webhook handler, incident service, rollback service
- Frontend: load notifications from API on app start, update count via WebSocket

---

### Task 34: Real audit log persistence
**File:** `backend/routers/audit.py`
- All actions write to audit_logs via a shared `audit_service.log(user_id, action, details, project_id)`
- `GET /audit` — return paginated audit logs for dashboard
- Frontend Dashboard: load from `GET /audit?limit=10` if API available

---

### Task 35: Containerize backend with Docker
**New files:** `backend/Dockerfile`, `backend/.dockerignore`
- Multi-stage Dockerfile: stage 1 installs dependencies, stage 2 is slim runtime image
- Base image: `python:3.11-slim`
- Expose port 8000
- Health check: `GET /health` endpoint
- `.dockerignore`: exclude `__pycache__`, `.env`, `*.pyc`, `.git`
- Test locally: `docker build -t idp-backend . && docker run -p 8000:8000 idp-backend`
- Verify: `curl http://localhost:8000/health` returns `{ "status": "ok" }`

---

### Task 36: Create Kubernetes manifests (Kustomize base)
**New folder:** `k8s/base/`
- `deployment.yaml` — FastAPI Deployment, 2 replicas, readiness + liveness probes, resource limits (100m/256Mi requests, 500m/512Mi limits), envFrom ConfigMap + Secret
- `service.yaml` — ClusterIP Service on port 8000
- `configmap.yaml` — non-secret env vars: CORS_ORIGINS, LOG_LEVEL, ENVIRONMENT
- `ingress.yaml` — Nginx Ingress with TLS annotation for cert-manager
- `hpa.yaml` — HorizontalPodAutoscaler: min 2, max 6 replicas, CPU target 70%
- `kustomization.yaml` — lists all base resources

---

### Task 37: Create Kubernetes overlays (dev / staging / production)
**New folders:** `k8s/overlays/dev/`, `k8s/overlays/staging/`, `k8s/overlays/production/`

**dev overlay:**
- `kustomization.yaml` — extends base, sets namespace `idp-dev`
- `patch-replicas.yaml` — override replicas to 1
- `patch-configmap.yaml` — set ENVIRONMENT=dev, point to dev Supabase project

**staging overlay:**
- `kustomization.yaml` — extends base, sets namespace `idp-staging`
- `patch-configmap.yaml` — set ENVIRONMENT=staging, staging Supabase URL

**production overlay:**
- `kustomization.yaml` — extends base, sets namespace `idp-production`
- `patch-replicas.yaml` — override replicas to 3
- `patch-configmap.yaml` — set ENVIRONMENT=production

---

### Task 38: Create ArgoCD Application manifests
**New folder:** `argocd/`
- `application-dev.yaml` — ArgoCD Application targeting `k8s/overlays/dev`, namespace `idp-dev`, syncPolicy: manual
- `application-staging.yaml` — ArgoCD Application targeting `k8s/overlays/staging`, namespace `idp-staging`, syncPolicy: automated (prune + selfHeal)
- `application-production.yaml` — ArgoCD Application targeting `k8s/overlays/production`, namespace `idp-production`, syncPolicy: automated (prune + selfHeal)
- All three point to `repoURL: https://github.com/Dakshmulundkar/Internal-Developer-Platform`, `targetRevision: main`
- Apply with: `kubectl apply -f argocd/ -n argocd`

---

### Task 39: Create GitHub Actions CI/CD pipeline
**New file:** `.github/workflows/build-push.yml`

**Trigger:** push to `main` branch, changes inside `backend/**`

**Steps:**
1. Checkout repository
2. Set up Docker Buildx
3. Login to GitHub Container Registry (GHCR) using `GITHUB_TOKEN`
4. Extract short SHA: `SHORT_SHA=$(echo $GITHUB_SHA | head -c 7)`
5. Build and push image: `ghcr.io/dakshmulundkar/idp-backend:$SHORT_SHA` and `:latest`
6. Update `k8s/overlays/production/kustomization.yaml` — set `newTag: $SHORT_SHA` under images
7. Commit the manifest change: `git commit -am "ci: update backend image to $SHORT_SHA"`
8. Push the commit — ArgoCD detects the manifest change and automatically syncs

**Secrets needed in GitHub repository settings:**
- `GHCR_TOKEN` — GitHub Personal Access Token with `write:packages` scope (or use default `GITHUB_TOKEN`)

---

### Task 40: Create Kubernetes Secrets for sensitive config
**Manual step — not automated in CI (secrets never in Git):**
- Create secret in each namespace manually or via Sealed Secrets / External Secrets Operator:
```bash
kubectl create secret generic idp-secrets \
  --from-literal=SUPABASE_URL=https://xxx.supabase.co \
  --from-literal=SUPABASE_KEY=eyJ... \
  --from-literal=OPENAI_API_KEY=sk-... \
  --from-literal=VERCEL_WEBHOOK_SECRET=whsec_... \
  --from-literal=NETLIFY_WEBHOOK_SECRET=whsec_... \
  -n idp-production
```
- Document all required secret keys in `k8s/secrets.example.txt` (values blank)
- Add `k8s/secrets.example.txt` to repo, add `k8s/**/secret.yaml` to `.gitignore`

---

### Task 41: Deploy ArgoCD to Kubernetes cluster and register apps
**One-time cluster setup:**
1. Install ArgoCD: `kubectl create namespace argocd && kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml`
2. Access ArgoCD UI: `kubectl port-forward svc/argocd-server -n argocd 8080:443`
3. Get initial admin password: `kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | base64 -d`
4. Apply the three application manifests: `kubectl apply -f argocd/ -n argocd`
5. ArgoCD will immediately sync dev and staging (automated); production syncs on next manifest commit
6. Verify in ArgoCD UI: all 3 applications show `Synced` and `Healthy`

---

### Task 42: Deployment — frontend
**File:** `vite.config.ts`, `.env.production`
- Add `VITE_API_URL` pointing to the Kubernetes Ingress public URL (e.g. `https://api.idp.devcorp.com`)
- Add `VITE_WS_URL` pointing to the WebSocket endpoint (e.g. `wss://api.idp.devcorp.com`)
- Deploy frontend to Vercel or Netlify — set `VITE_API_URL` and `VITE_WS_URL` as environment variables in the hosting dashboard
- Verify demo mode still works when env vars are absent (offline/demo fallback)
- The frontend has zero Kubernetes dependency — it only needs the public API URL

---

## Execution Order Summary

### Phase 1 (UI only — do first, no backend needed)
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14

### Phase 2 (backend + infrastructure — after Phase 1 verified)
**Backend code:** 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 24 → 25 → 26 → 27 → 28 → 29 → 30 → 31 → 32 → 33 → 34

**Infrastructure + ArgoCD:** 35 → 36 → 37 → 38 → 39 → 40 → 41 → 42

---

## Files Changed Summary

### Phase 1
| File | Change |
|------|--------|
| `src/types/platform.ts` | Task 1 — 3 new optional fields |
| `src/context/PlatformContext.tsx` | Task 2 — updateIncident action |
| `src/pages/Incidents.tsx` | Tasks 3–13 — full rewrite |

### Phase 2 — Backend Code
| File/Folder | Change |
|-------------|--------|
| `backend/` (new) | Tasks 15–34 — FastAPI backend |
| `src/services/api.ts` (new) | Tasks 18+ — API client layer |
| `src/context/PlatformContext.tsx` | Tasks 18,20,25,27,29,33,34 — API integration |
| `src/pages/AIAssistant.tsx` | Task 29 — real LLM |
| `src/pages/RollbackRecovery.tsx` | Task 27 — real rollback |
| `src/pages/Monitoring.tsx` | Task 31 — real plugin data |
| `src/pages/Integrations.tsx` | Task 31 — real connection test |
| `.env.example` (new) | Task 15 — env var template |

### Phase 2 — Infrastructure (ArgoCD + Kubernetes)
| File/Folder | Change |
|-------------|--------|
| `backend/Dockerfile` (new) | Task 35 — multi-stage Docker build |
| `backend/.dockerignore` (new) | Task 35 |
| `k8s/base/` (new) | Task 36 — base K8s manifests |
| `k8s/overlays/dev/` (new) | Task 37 — dev environment overlay |
| `k8s/overlays/staging/` (new) | Task 37 — staging overlay |
| `k8s/overlays/production/` (new) | Task 37 — production overlay |
| `argocd/application-dev.yaml` (new) | Task 38 — ArgoCD dev app |
| `argocd/application-staging.yaml` (new) | Task 38 — ArgoCD staging app |
| `argocd/application-production.yaml` (new) | Task 38 — ArgoCD production app |
| `.github/workflows/build-push.yml` (new) | Task 39 — CI/CD pipeline |
| `k8s/secrets.example.txt` (new) | Task 40 — secrets template |
| `.env.production` (new) | Task 42 — frontend env vars |

### Files NOT Changed at Any Phase
- All frontend pages except Incidents, AIAssistant, RollbackRecovery, Monitoring, Integrations
- `seedData.ts` — remains for demo mode fallback throughout both phases
- `description.md`, `README.md` — updated separately as documentation
