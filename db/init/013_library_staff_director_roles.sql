-- Extend user roles and thesis workflow for library_staff + director stages.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('student', 'reviewer', 'library_staff', 'director', 'admin'));

ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;

-- Submissions already in approving (legacy admin queue) stay valid for director.
ALTER TABLE submissions
  ADD CONSTRAINT submissions_status_check
  CHECK (status IN ('reviewing', 'library_review', 'approving', 'approved', 'reject'));
