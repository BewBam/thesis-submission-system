CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  dspace_item_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS submission_files (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'rejected')),
  comment TEXT
);
