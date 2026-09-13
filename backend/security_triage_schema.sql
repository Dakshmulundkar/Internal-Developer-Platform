-- =============================================================================
-- Security Triage Schema Migration — idempotent (safe to run multiple times)
-- Adds microservice-scoped fields + RBAC audit trail for security incidents.
-- Run AFTER supabase_schema.sql in the Supabase SQL editor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- projects: add microservice identification
-- ---------------------------------------------------------------------------
ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_repository_url TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT 'backend';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS security_config JSONB DEFAULT '{}';

-- A project can model at most one microservice.
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_service_name
  ON projects (service_name) WHERE service_name IS NOT NULL;

-- ---------------------------------------------------------------------------
-- incidents: add service scope + security metadata
-- ---------------------------------------------------------------------------
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS service_id TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS service_repository_url TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS security_metadata JSONB DEFAULT '{}';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS visibility_scope TEXT DEFAULT 'project';
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS idx_incidents_service_id ON incidents (service_id);
CREATE INDEX IF NOT EXISTS idx_incidents_source ON incidents (source);

-- ---------------------------------------------------------------------------
-- security_incident_audit_logs — immutable trail for security triage actions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS security_incident_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  service_id TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id),
  actor_email TEXT,
  action TEXT NOT NULL,
  old_state JSONB,
  new_state JSONB,
  notes TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_incident ON security_incident_audit_logs (incident_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_service ON security_incident_audit_logs (service_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_project ON security_incident_audit_logs (project_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_created ON security_incident_audit_logs (created_at);

ALTER TABLE security_incident_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "security_audit_project_members" ON security_incident_audit_logs;
CREATE POLICY "security_audit_project_members"
  ON security_incident_audit_logs FOR ALL
  USING (
    project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
    OR project_id IN (SELECT project_id FROM team_members WHERE user_id = auth.uid())
  );

GRANT ALL ON security_incident_audit_logs TO authenticated;
GRANT ALL ON security_incident_audit_logs TO service_role;

-- ---------------------------------------------------------------------------
-- incidents RLS: extend access to project team members (RBAC)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "owner" ON incidents;
CREATE POLICY "owner" ON incidents FOR ALL USING (
  project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  OR project_id IN (SELECT project_id FROM team_members WHERE user_id = auth.uid())
);