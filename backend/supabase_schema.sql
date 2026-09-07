-- =============================================================================
-- IDP Supabase Schema — idempotent (safe to run multiple times)
-- Paste this entire file into the Supabase SQL editor and run it.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  repo_owner TEXT,
  repo_name TEXT,
  branch TEXT DEFAULT 'main',
  provider TEXT NOT NULL,
  environment TEXT DEFAULT 'production',
  status TEXT DEFAULT 'queued',
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  vercel_project_id TEXT,
  netlify_site_id TEXT,
  webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON projects;
CREATE POLICY "owner" ON projects FOR ALL USING (owner_id = auth.uid());
GRANT ALL ON projects TO authenticated;
GRANT ALL ON projects TO service_role;

-- ---------------------------------------------------------------------------
-- deployments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  version TEXT,
  status TEXT,
  commit_hash TEXT,
  commit_message TEXT,
  branch TEXT,
  author TEXT,
  author_avatar TEXT,
  provider TEXT,
  duration_ms INTEGER DEFAULT 0,
  url TEXT,
  logs JSONB,
  stages JSONB,
  error_message TEXT,
  external_event_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE deployments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON deployments;
CREATE POLICY "owner" ON deployments FOR ALL USING (
  project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- incidents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  severity TEXT,
  provider TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'open',
  assigned_to TEXT,
  ignored_reason TEXT,
  feedback_is_real BOOLEAN,
  feedback_comment TEXT,
  suggested_action TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON incidents;
CREATE POLICY "owner" ON incidents FOR ALL USING (
  project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- incident_comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incident_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  user_avatar TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE incident_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON incident_comments;
CREATE POLICY "owner" ON incident_comments FOR ALL USING (
  incident_id IN (
    SELECT id FROM incidents WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

-- ---------------------------------------------------------------------------
-- incident_timeline
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incident_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE incident_timeline ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON incident_timeline;
CREATE POLICY "owner" ON incident_timeline FOR ALL USING (
  incident_id IN (
    SELECT id FROM incidents WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

-- ---------------------------------------------------------------------------
-- rollback_operations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rollback_operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  failed_deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  target_deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  target_version TEXT,
  status TEXT DEFAULT 'queued',
  initiated_by UUID REFERENCES auth.users(id),
  error TEXT,
  audit_logs JSONB DEFAULT '[]',
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE rollback_operations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON rollback_operations;
CREATE POLICY "owner" ON rollback_operations FOR ALL USING (
  project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT,
  message TEXT,
  type TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
  deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON notifications;
CREATE POLICY "owner" ON notifications FOR ALL USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- plugin_installations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plugin_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plugin_id TEXT NOT NULL,
  plugin_name TEXT,
  category TEXT,
  status TEXT DEFAULT 'disconnected',
  api_key_encrypted TEXT,
  base_url TEXT,
  project_selector TEXT,
  config_data JSONB DEFAULT '{}',
  webhook_url TEXT,
  last_sync_at TIMESTAMPTZ,
  installed_by UUID REFERENCES auth.users(id),
  enabled_for_projects JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE plugin_installations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON plugin_installations;
CREATE POLICY "owner" ON plugin_installations FOR ALL USING (installed_by = auth.uid());

-- ---------------------------------------------------------------------------
-- monitoring_alerts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS monitoring_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT,
  title TEXT,
  description TEXT,
  severity TEXT,
  status TEXT DEFAULT 'firing',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  deployment_id UUID REFERENCES deployments(id) ON DELETE SET NULL,
  incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
  labels JSONB,
  value TEXT,
  threshold TEXT,
  fired_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
ALTER TABLE monitoring_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON monitoring_alerts;
CREATE POLICY "owner" ON monitoring_alerts FOR ALL USING (
  project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- audit_logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  action TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON audit_logs;
CREATE POLICY "owner" ON audit_logs FOR ALL USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- ai_analyses
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID UNIQUE REFERENCES incidents(id) ON DELETE CASCADE,
  explanation TEXT,
  confidence INTEGER,
  causes JSONB DEFAULT '[]',
  steps JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON ai_analyses;
CREATE POLICY "owner" ON ai_analyses FOR ALL USING (
  incident_id IN (
    SELECT id FROM incidents WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE incidents, notifications, deployments;

-- ---------------------------------------------------------------------------
-- GRANT privileges to authenticated and service_role on all tables
-- This fixes "permission denied for table X" errors with RLS enabled
-- ---------------------------------------------------------------------------
GRANT ALL ON deployments         TO authenticated; GRANT ALL ON deployments         TO service_role;
GRANT ALL ON incidents           TO authenticated; GRANT ALL ON incidents           TO service_role;
GRANT ALL ON incident_comments   TO authenticated; GRANT ALL ON incident_comments   TO service_role;
GRANT ALL ON incident_timeline   TO authenticated; GRANT ALL ON incident_timeline   TO service_role;
GRANT ALL ON rollback_operations TO authenticated; GRANT ALL ON rollback_operations TO service_role;
GRANT ALL ON notifications       TO authenticated; GRANT ALL ON notifications       TO service_role;
GRANT ALL ON plugin_installations TO authenticated; GRANT ALL ON plugin_installations TO service_role;
GRANT ALL ON monitoring_alerts   TO authenticated; GRANT ALL ON monitoring_alerts   TO service_role;
GRANT ALL ON audit_logs          TO authenticated; GRANT ALL ON audit_logs          TO service_role;
GRANT ALL ON ai_analyses         TO authenticated; GRANT ALL ON ai_analyses         TO service_role;
