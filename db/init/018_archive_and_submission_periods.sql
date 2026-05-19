CREATE TABLE IF NOT EXISTS universities (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS faculties (
  id UUID PRIMARY KEY,
  university_id UUID NOT NULL REFERENCES universities(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (university_id, code)
);

CREATE INDEX IF NOT EXISTS idx_faculties_university ON faculties (university_id);

CREATE TABLE IF NOT EXISTS semesters (
  id UUID PRIMARY KEY,
  faculty_id UUID NOT NULL REFERENCES faculties(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (faculty_id, code)
);

CREATE INDEX IF NOT EXISTS idx_semesters_faculty ON semesters (faculty_id);

CREATE TABLE IF NOT EXISTS submission_periods (
  id UUID PRIMARY KEY,
  faculty_id UUID NOT NULL REFERENCES faculties(id),
  semester_id UUID NOT NULL REFERENCES semesters(id),
  name TEXT NOT NULL,
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  allow_resubmit BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (opens_at < closes_at)
);

CREATE INDEX IF NOT EXISTS idx_submission_periods_faculty ON submission_periods (faculty_id);
CREATE INDEX IF NOT EXISTS idx_submission_periods_semester ON submission_periods (semester_id);
CREATE INDEX IF NOT EXISTS idx_submission_periods_status ON submission_periods (status);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS submission_period_id UUID REFERENCES submission_periods(id);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS university_name TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS faculty_name TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS semester_name TEXT NOT NULL DEFAULT '';
