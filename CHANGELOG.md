# Changelog

All notable changes to this project. Newest on top.
Ledger with per-change verification notes: `.opencode/memory/ledger.md`.

## Unreleased — Phase 6 closed (Tasks 56–60)
- Real rollback execution: fail-closed on missing token, provider errors fail the
  operation, one active rollback per project, poll timeout marks failed.
- AI remediation per incident (`POST /incidents/{id}/remediation`, cached, labeled).
- AI chat memory (`ai_chat_messages`, history-threaded prompts, preload endpoint).
- Sentry Issues tab live (`GET /monitoring/sentry/issues`, per-project isolation).
- Honesty batch: 45/45 catalog coverage confirmed, Fernet rotation support,
  per-plugin sync intervals, auth-method labels.

## Unreleased — Free deploy + static audit
- Railway/Netlify compatibility: Trivy binary baked into `backend/Dockerfile`,
  `$PORT`-respecting start command, new `netlify.toml` (SPA fallback, asset caching).
- OSV.dev manifest audit (npm/PyPI/Maven/Go/RubyGems) merged into project scans —
  pure HTTPS, no installs, HIGH/CRITICAL gate with omission counts.
- Deferred as opt-in: Playwright browser checks (feasible, too heavy for free tier
  to run always-on). Rejected: `tsc`/ESLint scanning (needs user node_modules).

## Unreleased — Plugin System Batches 0–4 (backend-complete catalog)

### Added
- Plugin adapter framework (`backend/services/plugins/`): `BaseAdapter` (test + fetch + send), registry with legacy-ID normalization, dispatch in `/plugins/test` and `plugin_sync`.
- Real credential tests + live fetching for 30+ plugins: Grafana, Vercel, GitHub (+Actions), Sentry, Datadog, New Relic, UptimeRobot, Rollbar, Bugsnag, PagerDuty, OpsGenie, CircleCI, Render, Railway, GitLab, Bitbucket, Jira, Linear, Discord, Prometheus, Elastic, Dynatrace, Honeycomb, Statuspage, Splunk On-Call, SonarQube, Snyk, Netlify, Jenkins, Travis CI, TeamCity, Azure Repos, Azure Pipelines, Heroku, Terraform Cloud, ArgoCD, Raygun, Airbrake, AWS CodeDeploy, CloudWatch, GCP Cloud Deploy, Kubernetes, Slack, Teams.
- Outbound delivery: `send()` on Slack/Discord/Teams/Jira/Linear, `POST /plugins/{id}/notify`, automatic incident fan-out (project-scoped, best-effort) from all incident creation paths, Send-test button in Plugin Config.
- Hard auth: stdlib AWS SigV4 signer, GCP service-account JWT flow, kubeconfig parsing, Slack/Microsoft OAuth start+callback routes.
- Per-plugin `configFields` rendered dynamically in Plugin Config (incl. textareas); saved to `config_data`, honored on test-before-save.
- `AlertSource` union, icons, labels, and Monitoring filter extended to every live source.
- Fernet encryption for stored plugin API keys (`FERNET_KEY` env; transparent legacy passthrough).
- Backend fixture suites: 117 pytest tests, no live vendor keys.

### Fixed
- Fake-success test paths removed (Vercel DNS-fail→success, Sentry unconditional success, GitHub always-success).
- Canonical `plugin-*` IDs everywhere; legacy rows normalized on read; fixed `ci_cd` seed category.
- Search "plugins" now lands on Integrations instead of the "No plugin selected" dead end.
- Seed copy-paste rot: GCP fields/badge/events corrected; OpsGenie badge restored.

### Changed
- `plugin_sync` routes rows by kind (alerts → `monitoring_alerts`, deploys → `deployments`).

## Reverted — not in the tree (rolled back per explicit user order)
The items below were implemented and verified, then reverted to the GitHub
versions. They are recorded here so nobody mistakes the working tree for having them:
- Auth/session hardening (storage helpers, `idp_user` mirror, `authReady` gate).
- Dashboard 5-block rewrite, CountUp animation, attention-queue behavior.
- PipelineCenter rework (stage circles, trend selector, Service Insights).
- Light-theme override system, search/dropdown fixes, Pipelines rename, login theme switcher.
- Seed-data purge (demo branches, simulations, fixture URLs).
- Outstanding consequences live in the tree: reload logs out, seed/demo fallbacks
  present — see `phases.md` Phase 6 for the specified follow-ups.
