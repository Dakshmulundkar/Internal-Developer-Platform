-- =============================================================================
-- Repo Auto-Fix schema (Phase 8)
-- Run AFTER supabase_schema.sql (idempotent, safe to run multiple times)
-- Stores GitHub PATs (Fernet-encrypted at rest in the app layer) and the
-- audit trail of scan/apply runs.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- user_github_tokens — one encrypted classic PAT per user
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_github_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_token TEXT NOT NULL,
  token_last4 TEXT NOT NULL,
  scopes TEXT DEFAULT '',
  github_login TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_github_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_token" ON user_github_tokens;
CREATE POLICY "own_token" ON user_github_tokens FOR ALL USING (
  user_id = auth.uid()
);

-- ---------------------------------------------------------------------------
-- autofix_runs — scan/apply audit trail (findings + PR link + status)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS autofix_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT,
  repo TEXT,
  branch TEXT,
  pr_url TEXT,
  findings JSONB,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE autofix_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_runs" ON autofix_runs;
CREATE POLICY "own_runs" ON autofix_runs FOR ALL USING (
  user_id = auth.uid()
);

CREATE INDEX IF NOT EXISTS idx_autofix_runs_user ON autofix_runs (user_id, created_at DESC);
