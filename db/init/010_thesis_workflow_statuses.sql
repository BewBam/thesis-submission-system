-- Normalize thesis workflow statuses to:
-- reviewing -> library_review -> approving -> approved / reject

-- submissions.status
ALTER TABLE submissions DROP CONSTRAINT IF EXISTS submissions_status_check;

UPDATE submissions
SET status = CASE
  WHEN status = 'pending' THEN 'reviewing'
  WHEN status = 'rejected' THEN 'reject'
  ELSE status
END;

ALTER TABLE submissions
  ADD CONSTRAINT submissions_status_check CHECK (status IN ('reviewing', 'library_review', 'approving', 'approved', 'reject'));

-- reviews.status / reviews.decision
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_status_check;
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_decision_check;

UPDATE reviews
SET status = CASE
  WHEN status = 'rejected' THEN 'reject'
  ELSE status
END;

UPDATE reviews
SET decision = CASE
  WHEN decision = 'rejected' THEN 'reject'
  ELSE decision
END;

ALTER TABLE reviews
  ADD CONSTRAINT reviews_status_check CHECK (status IN ('pending', 'approved', 'reject'));

ALTER TABLE reviews
  ADD CONSTRAINT reviews_decision_check CHECK (decision IN ('pending', 'approved', 'reject'));
