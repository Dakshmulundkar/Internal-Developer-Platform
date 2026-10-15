-- =============================================================================
-- Incident feedback history (real Feedback tab)
-- Run AFTER supabase_schema.sql (idempotent, safe to run multiple times)
-- Stores one row per feedback submission so "who said what, when" survives;
-- the legacy feedback_is_real / feedback_comment columns on incidents stay
-- in sync as the "latest" values for older readers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- incident_feedback — per-member feedback history on an incident
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS incident_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT,
  is_real BOOLEAN NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_feedback_incident
  ON incident_feedback (incident_id, created_at DESC);

ALTER TABLE incident_feedback ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner" ON incident_feedback;
CREATE POLICY "owner" ON incident_feedback FOR ALL USING (
  incident_id IN (
    SELECT id FROM incidents WHERE project_id IN (
      SELECT id FROM projects WHERE owner_id = auth.uid()
    )
  )
);

GRANT ALL ON incident_feedback TO authenticated;
GRANT ALL ON incident_feedback TO service_role;
