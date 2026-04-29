-- Fix reviews table to support per-reviewer workflow without dual primary keys.
-- Safe to run on fresh DBs; uses IF EXISTS guards where possible.

-- Drop old single-column primary key on id (name may vary)
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_pkey;

-- Ensure id exists and is optional (composite PK will be submission_id + reviewer_id)
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();

-- Normalize reviewer_id to UUID to match users(id)
ALTER TABLE reviews
  ALTER COLUMN reviewer_id TYPE UUID USING reviewer_id::uuid;

-- Expand allowed workflow values
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_status_check;
ALTER TABLE reviews
  ADD CONSTRAINT reviews_status_check CHECK (status IN ('pending', 'approved', 'reject'));

ALTER TABLE reviews ADD COLUMN IF NOT EXISTS decision TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_decision_check;
ALTER TABLE reviews
  ADD CONSTRAINT reviews_decision_check CHECK (decision IN ('pending', 'approved', 'reject'));

UPDATE reviews
SET decision = status
WHERE decision = 'pending' AND status IS NOT NULL;

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_submission_reviewer_uniq;
ALTER TABLE reviews
  ADD CONSTRAINT reviews_submission_reviewer_uniq UNIQUE (submission_id, reviewer_id);

ALTER TABLE reviews DROP CONSTRAINT IF EXISTS reviews_pkey;
ALTER TABLE reviews
  ADD PRIMARY KEY (submission_id, reviewer_id);
