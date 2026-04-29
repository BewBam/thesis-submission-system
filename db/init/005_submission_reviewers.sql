CREATE TABLE IF NOT EXISTS submission_reviewers (
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (submission_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_reviewers_user ON submission_reviewers (user_id);

ALTER TABLE submissions ALTER COLUMN advisor_id DROP NOT NULL;
