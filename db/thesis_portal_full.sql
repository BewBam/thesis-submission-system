-- =============================================================================
-- Thesis Portal — full database (final schema for a new database)
-- =============================================================================
-- Run against an empty database, e.g. thesis_portal:
--
--   psql -U thesis_user -d thesis_portal -f db/thesis_portal_full.sql
--
-- Docker:
--   Get-Content db/thesis_portal_full.sql | docker exec -i thesis_postgres psql -U thesis_user -d thesis_portal
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Archive hierarchy
-- -----------------------------------------------------------------------------

CREATE TABLE universities (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE faculties (
  id UUID PRIMARY KEY,
  university_id UUID NOT NULL REFERENCES universities(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  dspace_community_id TEXT,
  dspace_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (dspace_sync_status IN ('pending', 'synced', 'failed')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (university_id, code)
);

CREATE INDEX idx_faculties_university ON faculties (university_id);

CREATE TABLE semesters (
  id UUID PRIMARY KEY,
  faculty_id UUID NOT NULL REFERENCES faculties(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  dspace_community_id TEXT,
  dspace_collection_id TEXT,
  collection_name TEXT NOT NULL DEFAULT '',
  dspace_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (dspace_sync_status IN ('pending', 'synced', 'failed')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (faculty_id, code)
);

CREATE INDEX idx_semesters_faculty ON semesters (faculty_id);

CREATE TABLE submission_periods (
  id UUID PRIMARY KEY,
  faculty_id UUID NOT NULL REFERENCES faculties(id),
  semester_id UUID NOT NULL REFERENCES semesters(id),
  name TEXT NOT NULL,
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  allow_resubmit BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (opens_at < closes_at)
);

CREATE INDEX idx_submission_periods_faculty ON submission_periods (faculty_id);
CREATE INDEX idx_submission_periods_semester ON submission_periods (semester_id);
CREATE INDEX idx_submission_periods_status ON submission_periods (status);

-- -----------------------------------------------------------------------------
-- Users & permissions
-- -----------------------------------------------------------------------------

CREATE TABLE users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL
    CHECK (role IN ('student', 'reviewer', 'library_staff', 'director', 'admin')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  faculty_id UUID REFERENCES faculties(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_role ON users (role);

CREATE TABLE role_permissions (
  role TEXT NOT NULL,
  permission TEXT NOT NULL,
  allowed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (role, permission)
);

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- Thesis submissions
-- -----------------------------------------------------------------------------

CREATE TABLE submissions (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  advisor TEXT NOT NULL DEFAULT '',
  abstract TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '',
  student_id TEXT NOT NULL,
  advisor_id TEXT,
  status TEXT NOT NULL
    CHECK (status IN ('draft', 'reviewing', 'approved', 'rejected', 'archived')),
  dspace_item_id TEXT,
  submission_period_id UUID REFERENCES submission_periods(id),
  university_name TEXT NOT NULL DEFAULT '',
  faculty_name TEXT NOT NULL DEFAULT '',
  semester_name TEXT NOT NULL DEFAULT '',
  student_email TEXT NOT NULL DEFAULT '',
  title_vi TEXT NOT NULL DEFAULT '',
  title_en TEXT NOT NULL DEFAULT '',
  thesis_advisors TEXT NOT NULL DEFAULT '',
  major TEXT NOT NULL DEFAULT '',
  thesis_year TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_submissions_one_active_per_student
  ON submissions (student_id)
  WHERE status <> 'draft';

CREATE TABLE submission_files (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'attachment'
);

CREATE TABLE submission_authors (
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (submission_id, user_id)
);

CREATE INDEX idx_submission_authors_user ON submission_authors (user_id);

CREATE TABLE submission_reviewers (
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (submission_id, user_id)
);

CREATE INDEX idx_submission_reviewers_user ON submission_reviewers (user_id);

CREATE TABLE reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'reject')),
  decision TEXT NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'approved', 'reject')),
  comment TEXT,
  decided_at TIMESTAMPTZ,
  PRIMARY KEY (submission_id, reviewer_id),
  CONSTRAINT reviews_submission_reviewer_uniq UNIQUE (submission_id, reviewer_id)
);

CREATE TABLE submission_events (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  actor_id TEXT,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_submission_events_submission_time
  ON submission_events (submission_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Seed: demo users (development only)
-- -----------------------------------------------------------------------------

INSERT INTO users (id, username, password, display_name, role) VALUES
  ('11111111-1111-1111-1111-111111111101', 'student1', 'student123', 'Student Alpha', 'student'),
  ('11111111-1111-1111-1111-111111111102', 'student2', 'student123', 'Student Beta', 'student'),
  ('11111111-1111-1111-1111-111111111103', 'student3', 'student123', 'Student Gamma', 'student'),
  ('22222222-2222-2222-2222-222222222201', 'reviewer1', 'review123', 'Reviewer One', 'reviewer'),
  ('22222222-2222-2222-2222-222222222202', 'reviewer2', 'review123', 'Reviewer Two', 'reviewer'),
  ('22222222-2222-2222-2222-222222222203', 'reviewer3', 'review123', 'Reviewer Three', 'reviewer'),
  ('33333333-3333-3333-3333-333333333301', 'admin1', 'admin123', 'Admin One', 'admin'),
  ('44444444-4444-4444-4444-444444444401', 'library1', 'library123', 'Library Staff One', 'library_staff'),
  ('55555555-5555-5555-5555-555555555501', 'director1', 'director123', 'Library Director', 'director')
ON CONFLICT (username) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Seed: role permissions
-- -----------------------------------------------------------------------------

INSERT INTO role_permissions (role, permission, allowed) VALUES
  ('student', 'submit_thesis', TRUE),
  ('student', 'review_academic', FALSE),
  ('student', 'library_intake', FALSE),
  ('student', 'director_approval', FALSE),
  ('student', 'view_all_submissions', FALSE),
  ('student', 'manage_users', FALSE),
  ('student', 'manage_roles', FALSE),
  ('student', 'configure_system', FALSE),
  ('reviewer', 'submit_thesis', FALSE),
  ('reviewer', 'review_academic', TRUE),
  ('reviewer', 'library_intake', FALSE),
  ('reviewer', 'director_approval', FALSE),
  ('reviewer', 'view_all_submissions', FALSE),
  ('reviewer', 'manage_users', FALSE),
  ('reviewer', 'manage_roles', FALSE),
  ('reviewer', 'configure_system', FALSE),
  ('library_staff', 'submit_thesis', FALSE),
  ('library_staff', 'review_academic', FALSE),
  ('library_staff', 'library_intake', TRUE),
  ('library_staff', 'director_approval', FALSE),
  ('library_staff', 'view_all_submissions', TRUE),
  ('library_staff', 'manage_users', FALSE),
  ('library_staff', 'manage_roles', FALSE),
  ('library_staff', 'configure_system', FALSE),
  ('director', 'submit_thesis', FALSE),
  ('director', 'review_academic', FALSE),
  ('director', 'library_intake', FALSE),
  ('director', 'director_approval', TRUE),
  ('director', 'view_all_submissions', TRUE),
  ('director', 'manage_users', FALSE),
  ('director', 'manage_roles', FALSE),
  ('director', 'configure_system', FALSE),
  ('admin', 'submit_thesis', FALSE),
  ('admin', 'review_academic', FALSE),
  ('admin', 'library_intake', FALSE),
  ('admin', 'director_approval', FALSE),
  ('admin', 'view_all_submissions', FALSE),
  ('admin', 'manage_users', TRUE),
  ('admin', 'manage_roles', TRUE),
  ('admin', 'configure_system', TRUE)
ON CONFLICT (role, permission) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Seed: system settings
-- -----------------------------------------------------------------------------

INSERT INTO system_settings (key, value, description) VALUES
  ('thesis_max_file_size_mb', '30', 'Maximum thesis PDF upload size in megabytes'),
  ('submission_timezone', 'Asia/Ho_Chi_Minh', 'Timezone for submission period open/close times'),
  ('library_support_phone', '3864 7256 (5419)', 'Library reference desk contact for deposit support'),
  ('maintenance_mode', 'false', 'When true, only administrators can sign in'),
  ('dspace_root_community_id', '', 'DSpace UUID of root thesis archive community (optional until Sprint 4)'),
  ('dspace_api_base_url', '', 'DSpace REST API base URL e.g. https://dspace.example.edu/server'),
  ('dspace_api_token', '', 'DSpace REST API bearer token (keep empty in dev)')
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Seed: HCMUT archive (university, faculties, semesters, open submission periods)
-- -----------------------------------------------------------------------------

INSERT INTO universities (id, code, name, status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'HCMUT', 'Trường Đại học Bách khoa TP.HCM', 'active')
ON CONFLICT (code) DO NOTHING;

INSERT INTO faculties (id, university_id, code, name, status, dspace_community_id, dspace_sync_status) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'CIVIL', 'CIVIL ENGINEERING', 'active', 'dev-community-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', 'synced'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'GEOPE', 'GEOLOGY AND PETROLEUM ENGINEERING', 'active', 'dev-community-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', 'synced'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'APPLSCI', 'APPLIED SCIENCE', 'active', 'dev-community-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', 'synced'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'MECH', 'MECHANICAL ENGINEERING', 'active', 'dev-community-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004', 'synced'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'MATTECH', 'MATERIAL TECHNOLOGY', 'active', 'dev-community-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005', 'synced'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'TRANSP', 'TRANSPORTATION ENGINEERING', 'active', 'dev-community-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006', 'synced'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'CSE', 'COMPUTER SCIENCE AND ENGINEERING', 'active', 'dev-community-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0007', 'synced'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'CHEM', 'CHEMICAL ENGINEERING', 'active', 'dev-community-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008', 'synced'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'SIM', 'SCHOOL OF INDUSTRIAL MANAGEMENT', 'active', 'dev-community-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0009', 'synced'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'ENR', 'ENVIRONMENT AND NATURAL RESOURCES', 'active', 'dev-community-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010', 'synced'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'EEE', 'ELECTRICAL AND ELECTRONICS ENGINEERING', 'active', 'dev-community-bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011', 'synced')
ON CONFLICT (university_id, code) DO UPDATE
  SET name = EXCLUDED.name,
      status = 'active',
      dspace_community_id = COALESCE(faculties.dspace_community_id, EXCLUDED.dspace_community_id),
      dspace_sync_status = 'synced';

INSERT INTO semesters (id, faculty_id, code, name, status, collection_name, dspace_collection_id, dspace_community_id, dspace_sync_status) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccc0001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', '2025-1', 'Semester 1 — 2025', 'active', 'Luận văn – 2025-1', 'dev-collection-cccccccc-cccc-cccc-cccc-cccccccc0001', 'dev-semester-cccccccc-cccc-cccc-cccc-cccccccc0001', 'synced'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', '2025-1', 'Semester 1 — 2025', 'active', 'Luận văn – 2025-1', 'dev-collection-cccccccc-cccc-cccc-cccc-cccccccc0002', 'dev-semester-cccccccc-cccc-cccc-cccc-cccccccc0002', 'synced'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', '2025-1', 'Semester 1 — 2025', 'active', 'Luận văn – 2025-1', 'dev-collection-cccccccc-cccc-cccc-cccc-cccccccc0003', 'dev-semester-cccccccc-cccc-cccc-cccc-cccccccc0003', 'synced'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004', '2025-1', 'Semester 1 — 2025', 'active', 'Luận văn – 2025-1', 'dev-collection-cccccccc-cccc-cccc-cccc-cccccccc0004', 'dev-semester-cccccccc-cccc-cccc-cccc-cccccccc0004', 'synced'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0005', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005', '2025-1', 'Semester 1 — 2025', 'active', 'Luận văn – 2025-1', 'dev-collection-cccccccc-cccc-cccc-cccc-cccccccc0005', 'dev-semester-cccccccc-cccc-cccc-cccc-cccccccc0005', 'synced'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0006', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006', '2025-1', 'Semester 1 — 2025', 'active', 'Luận văn – 2025-1', 'dev-collection-cccccccc-cccc-cccc-cccc-cccccccc0006', 'dev-semester-cccccccc-cccc-cccc-cccc-cccccccc0006', 'synced'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0007', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0007', '2025-1', 'Semester 1 — 2025', 'active', 'Luận văn – 2025-1', 'dev-collection-cccccccc-cccc-cccc-cccc-cccccccc0007', 'dev-semester-cccccccc-cccc-cccc-cccc-cccccccc0007', 'synced'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0008', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008', '2025-1', 'Semester 1 — 2025', 'active', 'Luận văn – 2025-1', 'dev-collection-cccccccc-cccc-cccc-cccc-cccccccc0008', 'dev-semester-cccccccc-cccc-cccc-cccc-cccccccc0008', 'synced'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0009', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0009', '2025-1', 'Semester 1 — 2025', 'active', 'Luận văn – 2025-1', 'dev-collection-cccccccc-cccc-cccc-cccc-cccccccc0009', 'dev-semester-cccccccc-cccc-cccc-cccc-cccccccc0009', 'synced'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0010', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010', '2025-1', 'Semester 1 — 2025', 'active', 'Luận văn – 2025-1', 'dev-collection-cccccccc-cccc-cccc-cccc-cccccccc0010', 'dev-semester-cccccccc-cccc-cccc-cccc-cccccccc0010', 'synced'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0011', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011', '2025-1', 'Semester 1 — 2025', 'active', 'Luận văn – 2025-1', 'dev-collection-cccccccc-cccc-cccc-cccc-cccccccc0011', 'dev-semester-cccccccc-cccc-cccc-cccc-cccccccc0011', 'synced')
ON CONFLICT (faculty_id, code) DO NOTHING;

INSERT INTO submission_periods (id, faculty_id, semester_id, name, opens_at, closes_at, status, allow_resubmit) VALUES
  ('dddddddd-dddd-dddd-dddd-dddddddd0001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', 'cccccccc-cccc-cccc-cccc-cccccccc0001', 'Thesis deposit — HK1/2025 — Civil Engineering', NOW() - INTERVAL '7 days', NOW() + INTERVAL '90 days', 'open', TRUE),
  ('dddddddd-dddd-dddd-dddd-dddddddd0002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', 'cccccccc-cccc-cccc-cccc-cccccccc0002', 'Thesis deposit — HK1/2025 — Geology and Petroleum Engineering', NOW() - INTERVAL '7 days', NOW() + INTERVAL '90 days', 'open', TRUE),
  ('dddddddd-dddd-dddd-dddd-dddddddd0003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', 'cccccccc-cccc-cccc-cccc-cccccccc0003', 'Thesis deposit — HK1/2025 — Applied Science', NOW() - INTERVAL '7 days', NOW() + INTERVAL '90 days', 'open', TRUE),
  ('dddddddd-dddd-dddd-dddd-dddddddd0004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004', 'cccccccc-cccc-cccc-cccc-cccccccc0004', 'Thesis deposit — HK1/2025 — Mechanical Engineering', NOW() - INTERVAL '7 days', NOW() + INTERVAL '90 days', 'open', TRUE),
  ('dddddddd-dddd-dddd-dddd-dddddddd0005', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005', 'cccccccc-cccc-cccc-cccc-cccccccc0005', 'Thesis deposit — HK1/2025 — Material Technology', NOW() - INTERVAL '7 days', NOW() + INTERVAL '90 days', 'open', TRUE),
  ('dddddddd-dddd-dddd-dddd-dddddddd0006', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006', 'cccccccc-cccc-cccc-cccc-cccccccc0006', 'Thesis deposit — HK1/2025 — Transportation Engineering', NOW() - INTERVAL '7 days', NOW() + INTERVAL '90 days', 'open', TRUE),
  ('dddddddd-dddd-dddd-dddd-dddddddd0007', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0007', 'cccccccc-cccc-cccc-cccc-cccccccc0007', 'Thesis deposit — HK1/2025 — Computer Science and Engineering', NOW() - INTERVAL '7 days', NOW() + INTERVAL '90 days', 'open', TRUE),
  ('dddddddd-dddd-dddd-dddd-dddddddd0008', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008', 'cccccccc-cccc-cccc-cccc-cccccccc0008', 'Thesis deposit — HK1/2025 — Chemical Engineering', NOW() - INTERVAL '7 days', NOW() + INTERVAL '90 days', 'open', TRUE),
  ('dddddddd-dddd-dddd-dddd-dddddddd0009', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0009', 'cccccccc-cccc-cccc-cccc-cccccccc0009', 'Thesis deposit — HK1/2025 — School of Industrial Management', NOW() - INTERVAL '7 days', NOW() + INTERVAL '90 days', 'open', TRUE),
  ('dddddddd-dddd-dddd-dddd-dddddddd0010', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010', 'cccccccc-cccc-cccc-cccc-cccccccc0010', 'Thesis deposit — HK1/2025 — Environment and Natural Resources', NOW() - INTERVAL '7 days', NOW() + INTERVAL '90 days', 'open', TRUE),
  ('dddddddd-dddd-dddd-dddd-dddddddd0011', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011', 'cccccccc-cccc-cccc-cccc-cccccccc0011', 'Thesis deposit — HK1/2025 — Electrical and Electronics Engineering', NOW() - INTERVAL '7 days', NOW() + INTERVAL '90 days', 'open', TRUE)
ON CONFLICT (id) DO NOTHING;
