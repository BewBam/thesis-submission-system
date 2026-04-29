CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  advisor TEXT NOT NULL DEFAULT '',
  abstract TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '',
  student_id TEXT NOT NULL,
  advisor_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('reviewing', 'approving', 'approved', 'reject')),
  dspace_item_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submission_files (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'attachment'
);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS author TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS advisor TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS abstract TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS keywords TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS advisor_id TEXT;
ALTER TABLE submission_files ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'attachment';

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'reject')),
  comment TEXT
);

CREATE TABLE IF NOT EXISTS submission_events (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  actor_id TEXT,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
