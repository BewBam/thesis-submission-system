-- Backfill workflow history for submissions created before submission_events existed.
-- Safe to run multiple times (uses NOT EXISTS guards).

-- 1) Create a baseline "submitted" event when a submission has no history yet.
INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload, created_at)
SELECT gen_random_uuid(),
       s.id,
       s.student_id,
       'student',
       'submitted',
       jsonb_build_object('source', 'backfill'),
       s.created_at
FROM submissions s
WHERE NOT EXISTS (
  SELECT 1
  FROM submission_events ev
  WHERE ev.submission_id = s.id
);

-- 2) Backfill reviewer decisions from reviews table.
INSERT INTO submission_events (id, submission_id, actor_id, actor_role, event_type, payload, created_at)
SELECT gen_random_uuid(),
       r.submission_id,
       r.reviewer_id::text,
       'reviewer',
       CASE
         WHEN r.decision = 'approved' THEN 'reviewer_approved'
         WHEN r.decision = 'reject' THEN 'reviewer_rejected'
         ELSE 'reviewer_decision'
       END,
       jsonb_build_object('comment', r.comment, 'source', 'backfill'),
       COALESCE(r.decided_at, NOW())
FROM reviews r
WHERE r.decision IN ('approved', 'reject')
  AND NOT EXISTS (
    SELECT 1
    FROM submission_events ev
    WHERE ev.submission_id = r.submission_id
      AND ev.actor_id = r.reviewer_id::text
      AND ev.event_type = CASE
        WHEN r.decision = 'approved' THEN 'reviewer_approved'
        WHEN r.decision = 'reject' THEN 'reviewer_rejected'
        ELSE 'reviewer_decision'
      END
  );
