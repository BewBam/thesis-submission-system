-- Track when a reviewer approves/rejects a submission.
ALTER TABLE reviews
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;

-- Best-effort backfill for historical decided rows.
UPDATE reviews
SET decided_at = COALESCE(decided_at, NOW())
WHERE decision IN ('approved', 'reject');
