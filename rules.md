# Agent Rules
# Aether IDP — Internal Developer Platform

> These are mandatory rules for the AI agent working on this project.
> Read this file before making any changes. Follow every rule. No exceptions.

---

## RULE 0 — READ BEFORE TOUCHING ANYTHING

Before writing or editing any file:

1. Read `memory.md` — understand current project state, what's built, what's next
2. Read the target file in full — never guess at existing structure, imports, or types
3. Read `src/types/platform.ts` — check if the type you need already exists
4. Read `src/data/seedData.ts` — check if the seed data you need already exists
5. Read `src/context/PlatformContext.tsx` — check if the action you need already exists

**Never assume. Always verify by reading.**

---

## RULE 1 — UPDATE memory.md AFTER EVERY CHANGE

After completing any code change — no matter how small — update `memory.md`:

- Update `Last Verified State` with today's date and build result
- Update `Current Phase Status` if a phase or task changed
- Update `What Was Built` if a new feature was added
- Update `Key Files Reference` if a new file was created
- Update `Key Architectural Decisions` if a new pattern was introduced

**`memory.md` must always reflect the actual current state of the project. It is the single source of truth.**

---

## RULE 2 — FILES TO READ BEFORE EDITING EACH PAGE

| File you are editing | Files to read first |
|---------------------|---------------------|
| Any page in `src/pages/` | `src/types/platform.ts`, `src/context/PlatformContext.tsx`, the page file itself |
| `src/context/PlatformContext.tsx` | `src/types/platform.ts`, `src/data/seedData.ts` |
| `src/data/seedData.ts` | `src/types/platform.ts` |
| `src/types/platform.ts` | Current file in full before adding anything |
| `src/components/Header.tsx` | `src/context/PlatformContext.tsx` |
| `src/components/Sidebar.tsx` | `src/context/PlatformContext.tsx` |
| Any new page | All existing pages of the same category for style reference |
| `Dashboard.tsx` | `seedData.ts`, `PlatformContext.tsx`, current `Dashboard.tsx` |
| `Incidents.tsx` | `platform.ts`, `PlatformContext.tsx`, `seedData.ts` (aiExplanations) |
| `ProjectDetails.tsx` | `seedData.ts` (mockArgoCDStatus, initialSentryIssues), `platform.ts` |

---

## RULE 3 — ZERO TYPESCRIPT ERRORS IS NON-NEGOTIABLE

Every change must pass `getDiagnostics()` with 0 errors before being considered complete.

- Run `getDiagnostics()` on every file you modified
- If errors exist, fix them before moving on
- Never leave a file in a broken state
- The production build `tsc && vite build` must exit 0

---

## RULE 4 — NEVER BREAK DEMO MODE

The platform must always work fully offline with no `VITE_API_URL` set.

- Every page must render correctly using seed data
- Every context action must work without a backend
- Never add a `fetch()` or API call that runs unconditionally at page load
- Always guard API calls: `if (import.meta.env.VITE_API_URL) { ... }`
- Seed data in `seedData.ts` is the fallback for everything

---

## RULE 5 — NO BREAKING CHANGES TO EXISTING INTERFACES

When adding fields to existing TypeScript interfaces:

```ts
// ❌ WRONG — breaks existing seed data that doesn't have this field
interface Incident {
  newField: string  // required — will cause type errors on existing data
}

// ✅ CORRECT — optional field, existing data remains valid
interface Incident {
  newField?: string
}
```

- New fields on existing interfaces MUST be optional (`?`)
- New interfaces and types go in `src/types/platform.ts` and must be exported
- Never define types inline inside page files

---

## RULE 6 — ALL STATE GOES THROUGH PLATFORMCONTEXT

Never read from or write to `localStorage` directly in a page component.

```ts
// ❌ WRONG
const incidents = JSON.parse(localStorage.getItem('idp_incidents') || '[]')

// ✅ CORRECT
const { incidents } = usePlatform()
```

Never mutate state directly in a page. All state mutations go through context action functions defined in `PlatformContext.tsx`. If an action does not exist, add it to the context first.

---

## RULE 7 — MATCH THE EXISTING VISUAL DESIGN

Never introduce new color tokens, layout patterns, or component styles. Match what already exists.

### Color tokens to use:

| Element | Tailwind class |
|---------|---------------|
| Card background | `bg-white/[0.03]` |
| Card border | `border border-white/[0.06]` |
| Secondary background | `bg-white/[0.02]` |
| Hover background | `hover:bg-white/[0.05]` |
| Strong text | `text-zinc-200` |
| Muted text | `text-zinc-400` |
| Faint text | `text-zinc-500` |
| Ghost text | `text-zinc-600` |
| Critical badge | `bg-red-500/15 text-red-400 border border-red-500/25` |
| High badge | `bg-orange-500/10 text-orange-400 border border-orange-500/20` |
| Medium badge | `bg-amber-500/10 text-amber-400 border border-amber-500/20` |
| Low/info badge | `bg-zinc-500/10 text-zinc-400 border border-zinc-500/20` |
| Success badge | `bg-emerald-500/10 text-emerald-400 border border-emerald-500/20` |
| Error badge | `bg-red-500/10 text-red-400 border border-red-500/20` |
| Warning badge | `bg-amber-500/5 text-amber-400 border border-amber-500/20` |
| Primary button | `bg-white text-black hover:bg-zinc-200 font-medium` |
| Secondary button | `bg-zinc-900 text-zinc-300 border border-white/[0.06] hover:bg-zinc-800` |

### Font size scale:

| Usage | Class |
|-------|-------|
| Page heading | `text-xl font-semibold text-white tracking-tight` |
| Section header | `text-xs font-semibold text-zinc-100 uppercase tracking-wider` |
| Body text | `text-xs text-zinc-400` |
| Label / column header | `text-[10px] font-semibold text-zinc-500 uppercase tracking-wider` |
| Monospace value | `text-[10px] font-mono text-zinc-300` |
| Micro badge text | `text-[9px] font-mono` |

### Border radius:
- Cards: `rounded-xl`
- Dropdowns / tooltips: `rounded-lg`
- Badges: `rounded` or `rounded-full`
- Inputs: `rounded-md`
- Modals: `rounded-xl` or `rounded-2xl`

### Source plugin badge colors:
| Provider | Classes |
|----------|---------|
| Netlify (NF) | `bg-teal-500/10 text-teal-400 border border-teal-500/20` |
| Vercel (VC) | `bg-zinc-500/10 text-zinc-200 border border-zinc-500/20` |
| Grafana (GF) | `bg-orange-500/10 text-orange-400 border border-orange-500/20` |
| Datadog (DD) | `bg-purple-500/10 text-purple-400 border border-purple-500/20` |
| Sentry (SN) | `bg-violet-500/10 text-violet-400 border border-violet-500/20` |
| GitHub (GH) | `bg-slate-500/10 text-slate-200 border border-slate-500/20` |

---

## RULE 8 — ROLE ENFORCEMENT PATTERN

When adding any action that should be restricted by role, use this exact pattern:

```ts
const userProjectRole = (teamMembers as any[]).find(
  tm => tm.projectId === (activeProjectId || (projects as any[])[0]?.id) && tm.userId === user?.id
)?.role ?? 'admin'  // default admin — ensures demo mode always has full access
```

The `?? 'admin'` default is intentional. In demo mode, the logged-in user may not exist in `teamMembers`, so defaulting to admin gives full access.

### What each role can do:

| Action | viewer | developer | admin |
|--------|--------|-----------|-------|
| View everything | ✅ | ✅ | ✅ |
| Add comments | ❌ | ✅ | ✅ |
| Resolve incidents | ❌ | ✅ | ✅ |
| Ignore incidents | ❌ | ✅ | ✅ |
| Trigger rollback | ❌ | ❌ | ✅ |
| Install/remove plugins | ❌ | ❌ | ✅ |
| Configure plugins (save) | ❌ | ❌ | ✅ |
| Invite/edit/remove team members | ❌ | ❌ | ✅ |

### Enforcement style:
- **Viewer-blocked actions** — hide the button entirely, show a `viewer — read-only access` label
- **Exception: rollback button** — show as `disabled` with a `title` tooltip so viewer understands why
- **PluginConfig save** — hide button, show amber `Read-only — admin access required to save changes` notice

---

## RULE 9 — CONTEXT ACTIONS MUST LOG TO AUDIT

Every context action that modifies data must append an `AuditLog` entry. Required for:

- User login / logout
- Project create / delete
- Plugin install / uninstall / configure
- Incident resolve / ignore
- Rollback initiation
- Team member add / remove / role change
- Webhook simulation trigger
- ArgoCD manual sync trigger

```ts
const newAudit: AuditLog = {
  id: 'a_' + Math.random().toString(36).substr(2, 9),
  userId: user.id,
  userName: user.name,
  action: 'ACTION_NAME',
  projectId: projectId,        // if applicable
  projectName: project.name,  // if applicable
  details: 'Human-readable description of what happened.',
  createdAt: new Date().toISOString()
}
setAuditLogs(prev => [newAudit, ...prev])
```

---

## RULE 10 — NO AUTONOMOUS DESTRUCTIVE ACTIONS

The agent must never:

- Automatically trigger a rollback without user interaction
- Automatically delete projects, incidents, or deployments
- Automatically resolve incidents
- Bypass the confirmation modal for rollback

Every destructive action requires explicit user input. This is a project requirement, not just a preference.

---

## RULE 11 — SEED DATA CONSISTENCY

When modifying `seedData.ts`:

- Every ID referenced in one export must exist in its target export (e.g. `incidentId` in Notifications must match an `id` in `initialIncidents`)
- IDs use the format matching their type: `p1–p5` (projects), `d101–d503` (deployments), `inc101–inc103` (incidents), `ma1–ma6` (alerts), `si1–si3` (sentry issues), `tm1–tm3` (team members)
- Data must look realistic — real tech stack names, real error messages, real commit message patterns
- Every status type must be represented — always have at least one `failed`, one `open`, one `resolved`, one `ready` example
- Never use placeholder text (`Lorem ipsum`, `Test 1`, `Sample project`)

---

## RULE 12 — NAVIGATION MUST USE navigateTo()

Never set `currentPage` directly. Always use the `navigateTo()` function from context:

```ts
// ❌ WRONG
setCurrentPage('incidents')

// ✅ CORRECT
navigateTo('incidents', { incidentId: inc.id })
```

`navigateTo()` handles: setting the page, updating active IDs (projectId, deploymentId, incidentId, pluginId), persisting to localStorage, and checking auth state.

---

## RULE 13 — LIST KEYS MUST BE STABLE IDs

Never use array index as a React key:

```tsx
// ❌ WRONG
{items.map((item, i) => <div key={i}>...</div>)}

// ✅ CORRECT
{items.map(item => <div key={item.id}>...</div>)}
```

---

## RULE 14 — useEffect WITH EVENT LISTENERS MUST CLEAN UP

```ts
// ❌ WRONG — memory leak
useEffect(() => {
  document.addEventListener('mousedown', handler)
}, [])

// ✅ CORRECT
useEffect(() => {
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [])
```

---

## RULE 15 — PHASE ORDER IS STRICT

```
Phase 1 (Tasks 1–14) → must be complete before Phase 1.5
Phase 1.5 (Tasks 43–55) → must be complete before Phase 2
Phase 2 Backend (Tasks 15–34) → must be complete before Phase 2 Infra
Phase 2 Infra (Tasks 35–42) → last
```

**No UI changes during Phase 2.** Once Phase 2 backend work begins, the frontend is frozen except for bug fixes.

---

## RULE 16 — VERIFY COMPLETENESS BEFORE DECLARING DONE

A task or change is only complete when ALL of the following are true:

1. ✅ The code change is implemented correctly
2. ✅ `getDiagnostics()` returns 0 errors on all modified files
3. ✅ `npm run build` exits 0 (run after any significant change)
4. ✅ The feature works in demo mode (no backend needed)
5. ✅ `memory.md` has been updated to reflect the change
6. ✅ No existing functionality is broken

---

## RULE 17 — HOW TO ADD A NEW PAGE

1. Read 2–3 existing pages for style reference
2. Create the file in `src/pages/`
3. Add the page type to `PageType` in `PlatformContext.tsx`
4. Add a navigation entry in `Sidebar.tsx`
5. Add the conditional render in `App.tsx`
6. Add the page to the `Key Files Reference` table in `memory.md`
7. Run `getDiagnostics()` on all 4 modified files

---

## RULE 18 — HOW TO ADD A NEW CONTEXT ACTION

1. Read `PlatformContext.tsx` in full first
2. Add the function signature to the `PlatformContextProps` interface
3. Implement the function inside `PlatformProvider`
4. Add it to the `value` object at the bottom of the Provider
5. If it modifies data: add an `AuditLog` entry (Rule 9)
6. If it's a significant event: add a `Notification` entry
7. The function must work without a backend (demo mode)
8. Run `getDiagnostics()` on `PlatformContext.tsx`

---

## RULE 19 — HOW TO ADD A NEW TYPE

1. Read `src/types/platform.ts` in full first
2. Add the type/interface at the bottom under an appropriate section comment
3. Export it
4. If it needs seed data: add it to `seedData.ts` and import the type there
5. If it needs context state: add it to `PlatformContext.tsx` (Rule 18)
6. Never define types inside page files or component files

---

## RULE 20 — AGENT SELF-CHECK BEFORE SUBMITTING ANY CHANGE

Before finishing any response that includes code changes, run through this checklist:

```
□ Did I read the target file before editing it?
□ Did I read memory.md before starting?
□ Are all TypeScript types correct? (no red squiggles mentally)
□ Did I run getDiagnostics() on every modified file?
□ Does demo mode still work? (no unconditional fetch calls)
□ Did I use existing color tokens? (no new arbitrary colors)
□ Did I use navigateTo() for navigation? (not setCurrentPage)
□ Are list keys stable IDs? (not index)
□ Did I update memory.md?
□ Is the build still passing?
```

If any box is unchecked, fix it before delivering the response.

---

## RULE 21 — WHEN IN DOUBT, READ THE SPEC

The canonical spec files are:

| Question | Read this |
|----------|-----------|
| What does this feature need to do? | `.kiro/specs/incidents-redesign/requirements.md` |
| How should this feature look? | `.kiro/specs/incidents-redesign/design.md` |
| What tasks are pending? | `.kiro/specs/incidents-redesign/tasks.md` |
| What is the current project state? | `memory.md` |
| What are the product requirements? | `prd.md` |
| How is the system architected? | `architecture.md` |
| What phases exist? | `phases.md` |

---

## RULE 22 — COMMIT MESSAGE FORMAT

When asked to commit changes, use conventional commit format:

```
feat(dashboard): move service health widget below audit trail

- Removed service health from right column panel
- Added full-width service health card below both panels
- 3 equal columns: Grafana / Sentry / Datadog
- Large text-2xl values with status badges
```

Format: `<type>(<scope>): <short description>`

Types: `feat`, `fix`, `chore`, `docs`, `ci`, `refactor`, `style`
Scope: the page or module changed (e.g. `dashboard`, `incidents`, `context`, `types`)

---

## RULE 23 — DO NOT OVER-ENGINEER

Implement exactly what was asked. No more.

- Do not add features that weren't requested
- Do not refactor code that wasn't touched
- Do not add abstractions the codebase doesn't need
- Do not change working code while implementing something else
- Keep the diff focused and minimal

If a change requires touching more files than expected, stop and explain why before proceeding.
