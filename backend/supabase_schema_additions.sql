-- =============================================================================
-- IDP Supabase Schema ADDITIONS — v1.6 features
-- Run this file AFTER supabase_schema.sql (idempotent, safe to run multiple times)
-- Additions: comments on all entities, attachments, activity feeds,
--            team_members, notification_preferences, share_links, search indexes
-- =============================================================================

-- ---------------------------------------------------------------------------
-- deployment_comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS deployment_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id UUID REFERENCES deployments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  user_avatar TEXT,
  content TEXT NOT NULL,
  edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE deployment_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON deployment_comments;
CREATE POLICY "owner" ON deployment_comments FOR ALL USING (
  deployment_id IN (
    SELECT id FROM deployments WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

-- ---------------------------------------------------------------------------
-- rollback_comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rollback_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rollback_id UUID REFERENCES rollback_operations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  user_avatar TEXT,
  content TEXT NOT NULL,
  edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE rollback_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON rollback_comments;
CREATE POLICY "owner" ON rollback_comments FOR ALL USING (
  rollback_id IN (
    SELECT id FROM rollback_operations WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

-- ---------------------------------------------------------------------------
-- project_comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS project_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  user_avatar TEXT,
  content TEXT NOT NULL,
  edited BOOLEAN DEFAULT FALSE,
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON project_comments;
CREATE POLICY "owner" ON project_comments FOR ALL USING (
  project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- generic entity_activities (per-entity activity feed for all types)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS entity_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,          -- 'project' | 'deployment' | 'incident' | 'rollback'
  entity_id UUID NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  action TEXT NOT NULL,               -- 'status_change' | 'comment' | 'assigned' | 'webhook' | 'deploy' | 'rollback' ...
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE entity_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON entity_activities;
CREATE POLICY "owner" ON entity_activities FOR ALL USING (
  entity_type = 'project' AND entity_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
  OR entity_type = 'deployment' AND entity_id IN (SELECT id FROM deployments WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  OR entity_type = 'incident' AND entity_id IN (SELECT id FROM incidents WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
  OR entity_type = 'rollback' AND entity_id IN (SELECT id FROM rollback_operations WHERE project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid()))
);
CREATE INDEX IF NOT EXISTS idx_activities_entity ON entity_activities(entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- attachments (file uploads linked to comments)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL,
  comment_type TEXT NOT NULL,          -- 'incident' | 'deployment' | 'rollback' | 'project'
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  filename TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON attachments;
CREATE POLICY "owner" ON attachments FOR ALL USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- notification_preferences (persist per-user notification settings)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_notifications BOOLEAN DEFAULT TRUE,
  incident_created BOOLEAN DEFAULT TRUE,
  incident_escalated BOOLEAN DEFAULT TRUE,
  deployment_failed BOOLEAN DEFAULT TRUE,
  rollback_completed BOOLEAN DEFAULT TRUE,
  mention_received BOOLEAN DEFAULT TRUE,
  daily_digest BOOLEAN DEFAULT FALSE,
  weekly_digest BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON notification_preferences;
CREATE POLICY "owner" ON notification_preferences FOR ALL USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- team_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'developer',
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, project_id)
);
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON team_members;
CREATE POLICY "owner" ON team_members FOR ALL USING (
  project_id IN (SELECT id FROM projects WHERE owner_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- share_links (guest/external read-only access)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,           -- 'incident' | 'deployment' | 'project'
  entity_id UUID NOT NULL,
  token TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  created_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON share_links;
CREATE POLICY "owner" ON share_links FOR ALL USING (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- user_preferences (dashboard layout, theme, timezone)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  dashboard_layout JSONB DEFAULT '[]',
  theme TEXT DEFAULT 'dark',
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON user_preferences;
CREATE POLICY "owner" ON user_preferences FOR ALL USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- automation_rules / automation_executions / scheduled_tasks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  trigger_type TEXT NOT NULL,          -- 'deployment.status_change' | 'incident.created' | 'alert.fired'
  trigger_config JSONB DEFAULT '{}',
  conditions JSONB DEFAULT '[]',
  actions JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  last_triggered_at TIMESTAMPTZ,
  trigger_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON automation_rules;
CREATE POLICY "owner" ON automation_rules FOR ALL USING (owner_id = auth.uid());
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]';

CREATE TABLE IF NOT EXISTS automation_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID REFERENCES automation_rules(id) ON DELETE CASCADE,
  triggered_by TEXT,
  triggered_id UUID,
  status TEXT DEFAULT 'success',        -- 'success' | 'failed' | 'skipped'
  result JSONB DEFAULT '{}',
  executed_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE automation_executions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON automation_executions;
CREATE POLICY "owner" ON automation_executions FOR ALL USING (
  rule_id IN (SELECT id FROM automation_rules WHERE owner_id = auth.uid())
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  cron_expression TEXT NOT NULL,
  task_type TEXT NOT NULL,              -- 'report' | 'health_check' | 'alert_sync' | 'email_digest'
  task_config JSONB DEFAULT '{}',
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES auth.users(id) NOT NULL,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE scheduled_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON scheduled_tasks;
CREATE POLICY "owner" ON scheduled_tasks FOR ALL USING (owner_id = auth.uid());
ALTER TABLE scheduled_tasks ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- ---------------------------------------------------------------------------
-- full-text search indexes (PostgreSQL built-in)
-- ---------------------------------------------------------------------------
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(suggested_action, ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS incidents_search_idx ON incidents USING GIN(search_vector);

ALTER TABLE deployments ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(commit_message, '') || ' ' || coalesce(version, '') || ' ' || coalesce(branch, ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS deployments_search_idx ON deployments USING GIN(search_vector);

ALTER TABLE projects ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS projects_search_idx ON projects USING GIN(search_vector);

-- ---------------------------------------------------------------------------
-- deployment stage detail (backfill for tables created before these columns
-- existed in supabase_schema.sql — CREATE TABLE IF NOT EXISTS never adds
-- columns to an existing table, so this ALTER is the one that fixes grey
-- stage circles on fresh dispatch runs)
-- ---------------------------------------------------------------------------
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS stages JSONB DEFAULT '[]';
ALTER TABLE deployments ADD COLUMN IF NOT EXISTS logs JSONB DEFAULT '[]';

-- ---------------------------------------------------------------------------
-- GRANT privileges for all new tables
-- ---------------------------------------------------------------------------
GRANT ALL ON deployment_comments   TO authenticated; GRANT ALL ON deployment_comments   TO service_role;
GRANT ALL ON rollback_comments     TO authenticated; GRANT ALL ON rollback_comments     TO service_role;
GRANT ALL ON project_comments      TO authenticated; GRANT ALL ON project_comments      TO service_role;
GRANT ALL ON entity_activities     TO authenticated; GRANT ALL ON entity_activities     TO service_role;
GRANT ALL ON attachments           TO authenticated; GRANT ALL ON attachments           TO service_role;
GRANT ALL ON notification_preferences TO authenticated; GRANT ALL ON notification_preferences TO service_role;
GRANT ALL ON team_members          TO authenticated; GRANT ALL ON team_members          TO service_role;
GRANT ALL ON share_links           TO authenticated; GRANT ALL ON share_links           TO service_role;
GRANT ALL ON user_preferences      TO authenticated; GRANT ALL ON user_preferences      TO service_role;
GRANT ALL ON automation_rules      TO authenticated; GRANT ALL ON automation_rules      TO service_role;
GRANT ALL ON automation_executions TO authenticated; GRANT ALL ON automation_executions TO service_role;
GRANT ALL ON scheduled_tasks       TO authenticated; GRANT ALL ON scheduled_tasks       TO service_role;

-- =============================================================================
-- v1.7 — Team Invite + Notifications
-- Idempotent additions — safe to run multiple times.
-- Run this section after all prior additions are applied.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- team_members: invite lifecycle columns
-- ---------------------------------------------------------------------------
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'accepted';
-- status: 'invited' | 'accepted' | 'declined'
-- New invites land as 'invited'; accepting/declining updates this field.

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invite_token TEXT;
-- Secure random URL-safe token (32 bytes) generated on invite creation.
-- Cleared (set to NULL) after accept or decline.

ALTER TABLE team_members ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ;
-- 7 days from invite creation. NULL for members added directly (status='accepted').

-- Index for fast token lookups during accept/decline
CREATE INDEX IF NOT EXISTS team_members_invite_token_idx ON team_members (invite_token)
  WHERE invite_token IS NOT NULL;

-- Index: pending invites for a given email (used by /invites/pending endpoint)
CREATE INDEX IF NOT EXISTS team_members_email_status_idx ON team_members (email, status);

-- Update existing rows to 'accepted' so they don't appear as pending invites
UPDATE team_members SET status = 'accepted' WHERE status IS NULL;

-- Non-owner invitees must be able to read their own pending invites
-- (matched by user_id OR email). The backend reads via the service role key
-- (which bypasses RLS), but this also lets any client-side Supabase queries
-- and the anon key see only the invitee's own rows.
DROP POLICY IF EXISTS "invitee_can_read_own_invites" ON team_members;
CREATE POLICY "invitee_can_read_own_invites" ON team_members
  FOR SELECT USING (
    user_id = auth.uid() OR email = auth.email()
  );

-- ---------------------------------------------------------------------------
-- notifications — in-platform notification inbox
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type         TEXT NOT NULL,
  -- types: 'team_invite' | 'incident_created' | 'deployment_failed' |
  --        'rollback_completed' | 'mention' | 'alert' | 'general'
  title        TEXT NOT NULL,
  message      TEXT,
  read         BOOLEAN DEFAULT FALSE,
  data         JSONB DEFAULT '{}',
  -- data carries type-specific payload (team_member_id, project_id, etc.)
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Defensive: ensure the deployed notifications table has every column. An early
-- version of this migration may have created the table without the `data` JSONB
-- column — without it, PostgREST returns 42703 on insert and the InviteBanner
-- accept/decline lookups fail. Safe to run repeatedly.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}';

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_notifications" ON notifications;
CREATE POLICY "owner_notifications" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- Fast lookup: unread notifications for a user (used by /invites/pending + bell badge)
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id, read, created_at DESC);

-- Fast lookup by invite data payload (used when accepting/declining to mark as read)
-- NOTE: Functional JSONB indexes on expression columns are not supported on all
-- Supabase Postgres tiers. The backend query still works correctly via a sequential
-- scan on the notifications table (which is per-user and small).
-- If you are on Postgres 15+ you may optionally run this manually:
--   CREATE INDEX notifications_data_team_member_idx ON notifications ((data->>'team_member_id'));

GRANT ALL ON notifications TO authenticated; GRANT ALL ON notifications TO service_role;
