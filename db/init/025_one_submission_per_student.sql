-- Each student may have many drafts but at most one non-draft submission.

CREATE UNIQUE INDEX IF NOT EXISTS idx_submissions_one_active_per_student
  ON submissions (student_id)
  WHERE status <> 'draft';
