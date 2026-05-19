-- Simplified submission statuses: draft, reviewing, approved, rejected, archived

ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;

UPDATE submissions SET status = 'rejected' WHERE status IN ('reject', 'rejected');
UPDATE submissions SET status = 'reviewing' WHERE status = 'library_review';
UPDATE submissions SET status = 'approved' WHERE status = 'approving';

ALTER TABLE submissions
  ADD CONSTRAINT submissions_status_check
  CHECK (status IN ('draft', 'reviewing', 'approved', 'rejected', 'archived'));
