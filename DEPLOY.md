# DEPLOY — Aether IDP (FREE-ONLY, $0/mo)

Stack: **Frontend → Vercel Free + Backend → Render Free + DB → Supabase Free + Warmer → UptimeRobot Free.**

No Railway (burns $5 credit then stops). No paid keys — Groq free covers AI.

## 0. Pre-reqs (one time)

1. Supabase SQL — in Supabase SQL editor run once each:
   - `backend/supabase_schema.sql`
   - `backend/supabase_schema_additions.sql`
   - `backend/security_triage_schema.sql`
   - `backend/incident_feedback_schema.sql`
   - `backend/autofix_schema.sql`
2. `FERNET_KEY` (if empty):
   `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
3. Never commit `.env` files — all values below go in host dashboards.

## 1. Backend → Render Free (Blueprint, no card)

1. dashboard.render.com → New → Blueprint → select this repo (`render.yaml` auto-detected).
2. Fill vars (copy from local `backend/.env`):
   ```
   SUPABASE_URL, SUPABASE_KEY, SUPABASE_SERVICE_KEY, FERNET_KEY (required)
   ENVIRONMENT=production
   CORS_ORIGINS=https://<your-frontend>.vercel.app
   APP_FRONTEND_URL=https://<your-frontend>.vercel.app
   APP_BACKEND_URL=https://<your-backend>.onrender.com
   GROQ_API_KEY (free tier — no OpenAI needed)
   GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET (optional)
   RESEND_API_KEY, FROM_EMAIL (optional — else invite emails log only)
   ```
3. Deploy → check `https://<your-backend>.onrender.com/health` → `{"status":"ok"}` (if `degraded`, read `config_warnings`, fill keys, redeploy).
4. Free limits: 750 hrs/mo, sleeps after 15 min idle, ~50s cold start. Keep 1 instance only — the APScheduler is in-memory, 2 instances double-fire cron jobs.

## 2. Frontend → Vercel Free

1. vercel.com → Add New Project → Import repo (`vercel.json` already sets `npm run build` → `dist` + SPA rewrite).
2. Environment Variables:
   ```
   VITE_API_URL=https://<your-backend>.onrender.com
   VITE_WS_URL=wss://<your-backend>.onrender.com
   VITE_GITHUB_CLIENT_ID=<same as backend> (optional)
   ```
   Do NOT set `VITE_USE_API` in production — `VITE_API_URL` alone enables API mode. Without it the app falls back to demo seed data.
3. Deploy → open URL. (Netlify works too via `netlify.toml` — same vars in Site settings → Environment variables.)

## 3. Keep Render warm (UptimeRobot Free)

Render Free sleeps without traffic — ping counts as traffic:

1. uptimerobot.com → Add Monitor → Monitor Type HTTP(s) → URL `https://<your-backend>.onrender.com/health` → interval 5 min.
2. Viva tip: open backend `/docs` 1 min before demo, then open frontend — warm = instant, cold = ~50s once.

## 4. Wire-up checklist

- [ ] Backend `/health` = `ok`
- [ ] `CORS_ORIGINS` = exact frontend origin, no trailing slash
- [ ] `VITE_API_URL` = backend https URL, no trailing slash; `VITE_WS_URL` = `wss://...`
- [ ] GitHub OAuth App callback = `{APP_BACKEND_URL}/auth/github/callback`
- [ ] Supabase DB pauses after 1 week idle on free tier — click Restore before viva week

## 5. Offline fallback (viva hall has no internet)

`docker compose up --build` → frontend `:5173`, backend `:8000`. Same `backend/.env` keys, no hosting needed.

## Troubleshooting (free-tier edition)

| Symptom | Fix |
|---|---|
| Frontend shows demo/seed data | `VITE_API_URL` unset or backend asleep — hit `/health` once, reload |
| First load takes ~50s, then fast | Normal Render Free cold start — pre-warm via `/docs` + UptimeRobot |
| CORS error | `CORS_ORIGINS` missing frontend origin |
| `/health` degraded | fill keys named in `config_warnings`, redeploy |
| WS never connects | `VITE_WS_URL` must be `wss://`, not `ws://` |
| 404 on refresh sub-route | already handled by `vercel.json` / `netlify.toml` — don't add routing |
