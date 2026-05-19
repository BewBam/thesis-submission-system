-- DSpace linkage and audit columns for archive configuration.

ALTER TABLE faculties ADD COLUMN IF NOT EXISTS dspace_community_id TEXT;
ALTER TABLE faculties ADD COLUMN IF NOT EXISTS dspace_sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE faculties ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE faculties ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE faculties DROP CONSTRAINT IF EXISTS faculties_dspace_sync_status_check;
ALTER TABLE faculties
  ADD CONSTRAINT faculties_dspace_sync_status_check
  CHECK (dspace_sync_status IN ('pending', 'synced', 'failed'));

ALTER TABLE semesters ADD COLUMN IF NOT EXISTS dspace_community_id TEXT;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS dspace_collection_id TEXT;
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS collection_name TEXT NOT NULL DEFAULT '';
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS dspace_sync_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE semesters ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE semesters DROP CONSTRAINT IF EXISTS semesters_dspace_sync_status_check;
ALTER TABLE semesters
  ADD CONSTRAINT semesters_dspace_sync_status_check
  CHECK (dspace_sync_status IN ('pending', 'synced', 'failed'));

ALTER TABLE submission_periods ADD COLUMN IF NOT EXISTS created_by TEXT;
ALTER TABLE submission_periods ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE users ADD COLUMN IF NOT EXISTS faculty_id UUID REFERENCES faculties(id);

INSERT INTO system_settings (key, value, description) VALUES
  ('dspace_root_community_id', '', 'DSpace UUID of root thesis archive community (optional until Sprint 4)'),
  ('dspace_api_base_url', '', 'DSpace REST API base URL e.g. https://dspace.example.edu/server'),
  ('dspace_api_token', '', 'DSpace REST API bearer token (keep empty in dev)')
ON CONFLICT (key) DO NOTHING;

-- Backfill collection names for seeded semesters.
UPDATE semesters
SET collection_name = 'Luận văn – ' || code
WHERE collection_name = '' OR collection_name IS NULL;

UPDATE semesters
SET dspace_collection_id = 'dev-collection-' || id::text
WHERE dspace_collection_id IS NULL;

UPDATE faculties
SET dspace_sync_status = 'synced',
    dspace_community_id = COALESCE(dspace_community_id, 'dev-community-' || id::text)
WHERE dspace_community_id IS NULL OR dspace_community_id = '';

UPDATE semesters
SET dspace_sync_status = 'synced',
    dspace_community_id = COALESCE(dspace_community_id, 'dev-semester-' || id::text)
WHERE dspace_community_id IS NULL OR dspace_community_id = '';
