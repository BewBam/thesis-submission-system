-- Allow students to save thesis submissions as drafts before submitting for review.

ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;

UPDATE submissions SET status = 'draft' WHERE status IS NULL OR status = '';

ALTER TABLE submissions
  ADD CONSTRAINT submissions_status_check
  CHECK (status IN ('draft', 'reviewing', 'approved', 'rejected', 'archived'));
