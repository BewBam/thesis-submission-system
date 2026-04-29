CREATE TABLE IF NOT EXISTS submission_authors (
  submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  PRIMARY KEY (submission_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_authors_user ON submission_authors (user_id);
