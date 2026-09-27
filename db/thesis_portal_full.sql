-- =============================================================================
-- Thesis Portal — full database (final schema for a new database)
-- =============================================================================
-- db/init/001_schema.sql and db/thesis_portal_full.sql are the same script.
-- Docker Compose mounts db/init into docker-entrypoint-initdb.d.
-- Run this only on an empty database. An existing volume does not re-run it.
--
--   psql -U thesis_user -d thesis_portal -f db/thesis_portal_full.sql
-- =============================================================================

SET client_encoding = 'UTF8';

-- -----------------------------------------------------------------------------
-- Archive hierarchy
-- -----------------------------------------------------------------------------

CREATE TABLE faculties (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE semesters (
  id UUID PRIMARY KEY,
  faculty_id UUID NOT NULL REFERENCES faculties(id),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_semesters_faculty ON semesters (faculty_id);

CREATE TABLE submission_periods (
  id UUID PRIMARY KEY,
  semester_id UUID NOT NULL REFERENCES semesters(id),
  name TEXT NOT NULL,
  opens_at TIMESTAMPTZ NOT NULL,
  closes_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  allow_resubmit BOOLEAN NOT NULL DEFAULT TRUE,
  dspace_collection_id TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (opens_at < closes_at)
);

COMMENT ON COLUMN submission_periods.dspace_collection_id IS
  'DSpace collection UUID for this submission period (preferred publish target)';

CREATE INDEX idx_submission_periods_semester ON submission_periods (semester_id);
CREATE INDEX idx_submission_periods_status ON submission_periods (status);

CREATE TABLE dspace_sync_nodes (
  dspace_id TEXT PRIMARY KEY,
  root_community_id TEXT NOT NULL,
  parent_dspace_id TEXT,
  node_type TEXT NOT NULL
    CHECK (node_type IN ('community', 'collection')),
  name TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0
    CHECK (depth >= 0),
  path TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dspace_sync_nodes_root ON dspace_sync_nodes (root_community_id);
CREATE INDEX idx_dspace_sync_nodes_parent ON dspace_sync_nodes (parent_dspace_id);
CREATE INDEX idx_dspace_sync_nodes_type ON dspace_sync_nodes (node_type);

-- -----------------------------------------------------------------------------
-- Users and permissions
-- -----------------------------------------------------------------------------

CREATE TABLE users (
  username TEXT PRIMARY KEY,
  password TEXT,
  display_name TEXT NOT NULL,
  auth_source TEXT NOT NULL DEFAULT 'local'
    CHECK (auth_source IN ('local', 'google')),
  role TEXT NOT NULL
    CHECK (role IN ('student', 'reviewer', 'library_staff', 'director', 'admin')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  faculty_id UUID REFERENCES faculties(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_academic_faculty_required CHECK (
    role NOT IN ('student', 'reviewer') OR faculty_id IS NOT NULL
  )
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
  reviewer TEXT NOT NULL DEFAULT '',
  abstract TEXT NOT NULL DEFAULT '',
  keywords TEXT NOT NULL DEFAULT '',
  student_id TEXT NOT NULL REFERENCES users(username),
  status TEXT NOT NULL
    CHECK (status IN ('draft', 'reviewing', 'approved', 'rejected', 'archived')),
  dspace_item_id TEXT,
  dspace_publish_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (dspace_publish_status IN ('pending', 'published', 'failed')),
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
  date_issued TEXT NOT NULL DEFAULT '',
  publisher TEXT NOT NULL DEFAULT '',
  document_type TEXT NOT NULL DEFAULT 'Thesis',
  language TEXT NOT NULL DEFAULT 'vie',
  description TEXT NOT NULL DEFAULT '',
  extra_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_submissions_status ON submissions (status);
CREATE INDEX idx_submissions_student_id ON submissions (student_id);
CREATE INDEX idx_submissions_period_id ON submissions (submission_period_id);

CREATE UNIQUE INDEX idx_submissions_one_active_per_student
  ON submissions (student_id)
  WHERE status <> 'draft';

CREATE UNIQUE INDEX idx_submissions_one_draft_per_student
  ON submissions (student_id)
  WHERE status = 'draft';

COMMENT ON INDEX idx_submissions_one_draft_per_student IS
  'Each student may have at most one draft; submit converts draft to reviewing';

CREATE TABLE submission_files (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'attachment'
);

CREATE TABLE submission_authors (
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (submission_id, user_id)
);

CREATE INDEX idx_submission_authors_user ON submission_authors (user_id);

CREATE TABLE reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL REFERENCES users(username),
  decision TEXT NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'approved', 'reject')),
  comment TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  decided_at TIMESTAMPTZ,
  PRIMARY KEY (submission_id, reviewer_id)
);

CREATE INDEX idx_reviews_reviewer_decision ON reviews (reviewer_id, decision);
CREATE INDEX idx_reviews_submission_sort ON reviews (submission_id, sort_order);

CREATE TABLE submission_events (
  id UUID PRIMARY KEY,
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  actor_id TEXT REFERENCES users(username) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_submission_events_submission_time
  ON submission_events (submission_id, created_at DESC);

CREATE OR REPLACE FUNCTION check_submitter_is_author()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM submission_authors sa
    WHERE sa.submission_id = NEW.id
      AND sa.user_id = NEW.student_id
  ) THEN
    RAISE EXCEPTION 'Submitter (%) must be listed in submission_authors for non-draft submission %',
      NEW.student_id, NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_submitter_is_author
  AFTER INSERT OR UPDATE OF student_id, status ON submissions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_submitter_is_author();

CREATE TABLE submission_form_fields (
  id UUID PRIMARY KEY,
  field_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  dspace_path TEXT NOT NULL DEFAULT '',
  input_type TEXT NOT NULL DEFAULT 'text'
    CHECK (input_type IN ('text', 'textarea', 'select', 'year')),
  required BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_value TEXT NOT NULL DEFAULT '',
  storage TEXT NOT NULL DEFAULT 'extra'
    CHECK (storage IN ('column', 'extra')),
  column_name TEXT,
  system_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (storage = 'extra' AND column_name IS NULL)
    OR (storage = 'column' AND column_name IS NOT NULL AND column_name <> '')
  )
);

CREATE INDEX idx_submission_form_fields_sort
  ON submission_form_fields (sort_order ASC, label ASC);

-- -----------------------------------------------------------------------------
-- Seed: faculties (before users that reference them)
-- -----------------------------------------------------------------------------

INSERT INTO faculties (id, name, status) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', 'Khoa Cơ khí', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', 'Khoa Công nghệ Vật liệu', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', 'Khoa Điện - Điện tử', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004', 'Khoa Khoa học Ứng dụng', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005', 'Khoa Khoa học và Kỹ thuật Máy tính', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006', 'Khoa Kỹ thuật Địa chất và Dầu khí', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0007', 'Khoa Kỹ thuật Giao thông', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008', 'Khoa Kỹ thuật Hóa học', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0009', 'Khoa Kỹ thuật Xây dựng', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010', 'Khoa Môi trường và Tài nguyên', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011', 'Khoa Quản lý Công nghiệp', 'active')
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  status = 'active',
  updated_at = NOW();

-- -----------------------------------------------------------------------------
-- Seed: bootstrap accounts
-- -----------------------------------------------------------------------------

INSERT INTO users (username, password, display_name, auth_source, role, faculty_id) VALUES
  ('student1', 'student123', 'Student Alpha', 'local', 'student', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005'),
  ('tuan.ngonhat', 'student123', 'Ngo Nhat Tuan', 'local', 'student', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005'),
  ('reviewer1', 'review123', 'Reviewer One', 'local', 'reviewer', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005'),
  ('admin1', 'admin123', 'Admin One', 'local', 'admin', NULL),
  ('library1', 'library123', 'Library Staff One', 'local', 'library_staff', NULL),
  ('director1', 'director123', 'Library Director', 'local', 'director', NULL)
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
-- Seed: system settings (final values after 016–041)
-- -----------------------------------------------------------------------------

INSERT INTO system_settings (key, value, description) VALUES
  ('thesis_max_file_size_mb', '30', 'Maximum thesis PDF upload size in megabytes'),
  ('submission_timezone', 'Asia/Ho_Chi_Minh', 'Timezone for submission period open/close times'),
  ('library_support_phone', '3864 7256 (5419)', 'Library reference desk contact for deposit support'),
  ('maintenance_mode', 'false', 'When true, only administrators can sign in'),
  ('login_method', 'username', 'Sign-in method for non-admin users: username (password form) or google (@hcmut.edu.vn). Admins can always use username/password.'),
  ('dspace_root_community_id', '7fd5cbb5-d2a1-4235-b5b0-7f5894771417', 'DSpace UUID of root archive community. Used as parent when provisioning faculties, and as starting point for Sync from DSpace (map faculty / semester / period by name).'),
  ('dspace_api_base_url', 'http://host.docker.internal:8080/server', 'DSpace REST API base URL e.g. http://host.docker.internal:8080/server'),
  ('dspace_api_token', '', 'Optional static Bearer token fallback when dspace_api_user/password are empty'),
  ('dspace_api_user', 'admin@mail.com', 'DSpace REST login email/username used for auto-login (preferred over dspace_api_token)'),
  ('dspace_api_password', '123456789', 'DSpace REST login password for auto-login (prefer env DSPACE_API_PASSWORD in production)'),
  ('email_enabled', 'false', 'When true, send workflow notification emails (requires SMTP settings)'),
  ('smtp_host', '', 'SMTP server hostname (e.g. smtp.gmail.com)'),
  ('smtp_port', '587', 'SMTP port (587 STARTTLS, 465 SSL)'),
  ('smtp_secure', 'false', 'true = TLS/SSL from the start (typically port 465); false = STARTTLS (typically 587)'),
  ('smtp_user', '', 'SMTP authentication username'),
  ('smtp_password', '', 'SMTP authentication password (prefer env SMTP_PASSWORD in production)'),
  ('smtp_from', '', 'From address shown on outgoing mail (e.g. Thesis Portal <noreply@hcmut.edu.vn>)'),
  ('email_portal_url', 'http://localhost:5173', 'Portal base URL used in email templates ({{portalUrl}})'),
  (
    'email_subject_reviewer_assigned',
    '[Cổng luận văn / Thesis Portal] Có luận văn mới cần phản biện | New thesis awaiting your review',
    'Subject when a student submits and assigned reviewers are notified. Placeholders: {{title}}, {{studentName}}, {{author}}, {{advisor}}, {{facultyName}}, {{semesterName}}, {{submissionId}}, {{portalUrl}}'
  ),
  (
    'email_body_reviewer_assigned',
    E'--- Tiếng Việt ---\nXin chào,\n\nMột luận văn đã được nộp và phân công cho bạn phản biện.\n\nTên đề tài: {{title}}\nSinh viên: {{studentName}}\nTác giả: {{author}}\nGVHD: {{advisor}}\nKhoa: {{facultyName}}\nHọc kỳ: {{semesterName}}\n\nĐăng nhập để phản biện:\n{{portalUrl}}\n\n--- English ---\nHello,\n\nA thesis has been submitted and assigned to you for review.\n\nTitle: {{title}}\nStudent: {{studentName}}\nAuthors: {{author}}\nAdvisors: {{advisor}}\nFaculty: {{facultyName}}\nSemester: {{semesterName}}\n\nPlease sign in to review:\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal',
    'Body when assigned reviewers are notified after student submit. Same placeholders as subject.'
  ),
  (
    'email_subject_library_review',
    '[Cổng luận văn / Thesis Portal] Luận văn sẵn sàng tiếp nhận thư viện | Thesis ready for library intake',
    'Subject when all reviewers approved and library staff are notified. Placeholders: {{title}}, {{studentName}}, {{author}}, {{advisor}}, {{facultyName}}, {{semesterName}}, {{submissionId}}, {{portalUrl}}'
  ),
  (
    'email_body_library_review',
    E'--- Tiếng Việt ---\nXin chào,\n\nTất cả phản biện học thuật đã duyệt luận văn. Hồ sơ sẵn sàng để thư viện tiếp nhận.\n\nTên đề tài: {{title}}\nSinh viên: {{studentName}}\nTác giả: {{author}}\nKhoa: {{facultyName}}\nHọc kỳ: {{semesterName}}\n\nĐăng nhập để xử lý:\n{{portalUrl}}\n\n--- English ---\nHello,\n\nAll academic reviewers have approved this thesis. It is ready for library intake.\n\nTitle: {{title}}\nStudent: {{studentName}}\nAuthors: {{author}}\nFaculty: {{facultyName}}\nSemester: {{semesterName}}\n\nPlease sign in to process intake:\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal',
    'Body when library staff are notified after all reviewers approve.'
  ),
  (
    'email_subject_director_review',
    '[Cổng luận văn / Thesis Portal] Luận văn đã duyệt — sẵn sàng lưu trữ | Thesis approved — ready to archive',
    'Subject when library staff approved and directors are notified. Placeholders: {{title}}, {{studentName}}, {{author}}, {{advisor}}, {{facultyName}}, {{semesterName}}, {{submissionId}}, {{portalUrl}}'
  ),
  (
    'email_body_director_review',
    E'--- Tiếng Việt ---\nXin chào,\n\nCán bộ thư viện đã duyệt luận văn. Hồ sơ sẵn sàng để giám đốc lưu trữ.\n\nTên đề tài: {{title}}\nSinh viên: {{studentName}}\nTác giả: {{author}}\nKhoa: {{facultyName}}\nHọc kỳ: {{semesterName}}\n\nĐăng nhập để lưu trữ:\n{{portalUrl}}\n\n--- English ---\nHello,\n\nLibrary staff have approved this thesis. It is ready for director archive.\n\nTitle: {{title}}\nStudent: {{studentName}}\nAuthors: {{author}}\nFaculty: {{facultyName}}\nSemester: {{semesterName}}\n\nPlease sign in to archive:\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal',
    'Body when directors are notified after library staff approve.'
  ),
  (
    'email_subject_student_rejected',
    '[Cổng luận văn / Thesis Portal] Luận văn của bạn bị từ chối | Your thesis submission was rejected',
    'Subject when a submission is rejected. Placeholders: {{title}}, {{studentName}}, {{reason}}, {{author}}, {{facultyName}}, {{semesterName}}, {{submissionId}}, {{portalUrl}}'
  ),
  (
    'email_body_student_rejected',
    E'--- Tiếng Việt ---\nXin chào {{studentName}},\n\nLuận văn của bạn đã bị từ chối.\n\nTên đề tài: {{title}}\nLý do: {{reason}}\n\nBạn có thể chỉnh sửa và nộp lại trên cổng:\n{{portalUrl}}\n\n--- English ---\nHello {{studentName}},\n\nYour thesis submission was rejected.\n\nTitle: {{title}}\nReason: {{reason}}\n\nYou may revise and resubmit in the portal:\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal',
    'Body when the student is notified of rejection (includes {{reason}}).'
  ),
  (
    'email_subject_student_submitted',
    '[Cổng luận văn / Thesis Portal] Luận văn của bạn đã được {{actionVi}} | Your thesis was {{actionEn}}',
    'Student notice after submit/resubmit. Placeholders: {{actionVi}}, {{actionEn}}, {{title}}, {{studentName}}, {{portalUrl}}'
  ),
  (
    'email_body_student_submitted',
    E'--- Tiếng Việt ---\nXin chào {{studentName}},\n\nLuận văn của bạn đã được {{actionVi}} và đang chờ phản biện.\n\nTên đề tài: {{title}}\n\nTheo dõi trên cổng:\n{{portalUrl}}\n\n--- English ---\nHello {{studentName}},\n\nYour thesis has been {{actionEn}} and is now with the assigned reviewers.\n\nTitle: {{title}}\n\nTrack progress in the portal:\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal',
    'Body after student submit/resubmit. {{actionVi}}/{{actionEn}} is nộp|submitted or nộp lại|resubmitted.'
  ),
  (
    'email_subject_student_reviewer_decision',
    '[Cổng luận văn / Thesis Portal] Phản biện {{decisionVi}} luận văn | A reviewer {{decisionEn}} your thesis',
    'Student notice when one reviewer approves or rejects. Placeholders: {{decisionVi}}, {{decisionEn}}, {{actorName}}, {{reason}}, {{title}}, {{studentName}}, {{portalUrl}}'
  ),
  (
    'email_body_student_reviewer_decision',
    E'--- Tiếng Việt ---\nXin chào {{studentName}},\n\nPhản biện {{actorName}} {{decisionVi}} luận văn của bạn.\n\nTên đề tài: {{title}}\n{{reasonBlock}}\nĐăng nhập:\n{{portalUrl}}\n\n--- English ---\nHello {{studentName}},\n\nReviewer {{actorName}} has {{decisionEn}} your thesis.\n\nTitle: {{title}}\n{{reasonBlock}}\nSign in:\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal',
    'Body for a single reviewer decision. {{reasonBlock}} is filled on reject (Lý do / Reason).'
  ),
  (
    'email_subject_student_all_reviewers_approved',
    '[Cổng luận văn / Thesis Portal] Tất cả phản biện đã duyệt | All reviewers approved your thesis',
    'Student notice when every assigned reviewer has approved. Placeholders: {{title}}, {{studentName}}, {{portalUrl}}'
  ),
  (
    'email_body_student_all_reviewers_approved',
    E'--- Tiếng Việt ---\nXin chào {{studentName}},\n\nTất cả phản biện học thuật đã duyệt luận văn. Hồ sơ đang chuyển tới cán bộ thư viện.\n\nTên đề tài: {{title}}\n\n{{portalUrl}}\n\n--- English ---\nHello {{studentName}},\n\nAll academic reviewers have approved your thesis. It is now with library staff.\n\nTitle: {{title}}\n\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal',
    'Body when all reviewers approved.'
  ),
  (
    'email_subject_student_library_decision',
    '[Cổng luận văn / Thesis Portal] Thư viện {{decisionVi}} luận văn | Library staff {{decisionEn}} your thesis',
    'Student notice for library intake approve/reject. Placeholders: {{decisionVi}}, {{decisionEn}}, {{actorName}}, {{reason}}, {{title}}, {{studentName}}, {{portalUrl}}'
  ),
  (
    'email_body_student_library_decision',
    E'--- Tiếng Việt ---\nXin chào {{studentName}},\n\nCán bộ thư viện ({{actorName}}) {{decisionVi}} luận văn của bạn.\n\nTên đề tài: {{title}}\n{{reasonBlock}}\n{{portalUrl}}\n\n--- English ---\nHello {{studentName}},\n\nLibrary staff ({{actorName}}) has {{decisionEn}} your thesis.\n\nTitle: {{title}}\n{{reasonBlock}}\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal',
    'Body for library staff decision.'
  ),
  (
    'email_subject_student_director_decision',
    '[Cổng luận văn / Thesis Portal] Giám đốc thư viện {{decisionVi}} luận văn | The library director {{decisionEn}} your thesis',
    'Student notice for director archive (accept) or reject. Placeholders: {{decisionVi}}, {{decisionEn}}, {{actorName}}, {{reason}}, {{title}}, {{studentName}}, {{portalUrl}}'
  ),
  (
    'email_body_student_director_decision',
    E'--- Tiếng Việt ---\nXin chào {{studentName}},\n\nGiám đốc thư viện ({{actorName}}) {{decisionVi}} luận văn của bạn.\n\nTên đề tài: {{title}}\n{{reasonBlock}}\n{{portalUrl}}\n\n--- English ---\nHello {{studentName}},\n\nThe library director ({{actorName}}) has {{decisionEn}} your thesis.\n\nTitle: {{title}}\n{{reasonBlock}}\n{{portalUrl}}\n\n— Cổng luận văn / Thesis Portal',
    'Body for director decision.'
  )
ON CONFLICT (key) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Seed: submission form fields
-- -----------------------------------------------------------------------------

INSERT INTO submission_form_fields (
  id, field_key, label, dspace_path, input_type, required, enabled, sort_order,
  options, default_value, storage, column_name, system_locked
) VALUES
  (
    'a1000001-0001-4000-8000-000000000001',
    'author',
    'Author',
    'dc.contributor.author',
    'text',
    TRUE,
    TRUE,
    10,
    '[]'::jsonb,
    '',
    'column',
    'author',
    TRUE
  ),
  (
    'a1000001-0001-4000-8000-000000000002',
    'title',
    'Title',
    'dc.title',
    'text',
    TRUE,
    TRUE,
    20,
    '[]'::jsonb,
    '',
    'column',
    'title',
    TRUE
  ),
  (
    'a1000001-0001-4000-8000-000000000003',
    'dateIssued',
    'Date of Issue',
    'dc.date.issued',
    'text',
    TRUE,
    TRUE,
    30,
    '[]'::jsonb,
    '',
    'column',
    'date_issued',
    TRUE
  ),
  (
    'a1000001-0001-4000-8000-000000000004',
    'publisher',
    'Publisher',
    'dc.publisher',
    'text',
    TRUE,
    TRUE,
    40,
    '[]'::jsonb,
    'Ho Chi Minh City University of Technology',
    'column',
    'publisher',
    TRUE
  ),
  (
    'a1000001-0001-4000-8000-000000000005',
    'documentType',
    'Type',
    'dc.type',
    'select',
    TRUE,
    TRUE,
    50,
    '[{"value":"Thesis","label":"Thesis"},{"value":"Dissertation","label":"Dissertation"},{"value":"Graduation thesis","label":"Graduation thesis"}]'::jsonb,
    'Thesis',
    'column',
    'document_type',
    TRUE
  ),
  (
    'a1000001-0001-4000-8000-000000000006',
    'language',
    'Language',
    'dc.language.iso',
    'select',
    TRUE,
    TRUE,
    60,
    '[{"value":"vie","label":"Vietnamese (vie)"},{"value":"eng","label":"English (eng)"}]'::jsonb,
    'vie',
    'column',
    'language',
    TRUE
  ),
  (
    'a1000001-0001-4000-8000-000000000007',
    'abstract',
    'Abstract',
    'dc.description.abstract',
    'textarea',
    TRUE,
    TRUE,
    70,
    '[]'::jsonb,
    '',
    'column',
    'abstract',
    TRUE
  ),
  (
    'a1000001-0001-4000-8000-000000000008',
    'description',
    'Description',
    'dc.description',
    'textarea',
    TRUE,
    TRUE,
    80,
    '[]'::jsonb,
    '',
    'column',
    'description',
    TRUE
  )
ON CONFLICT (field_key) DO NOTHING;
