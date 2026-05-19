-- Extended thesis metadata fields

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS student_email TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS title_vi TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS title_en TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS thesis_advisors TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS major TEXT NOT NULL DEFAULT '';
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS thesis_year TEXT NOT NULL DEFAULT '';

-- Backfill English title from legacy title column
UPDATE submissions
SET title_en = title
WHERE (title_en IS NULL OR title_en = '') AND title IS NOT NULL AND title <> '';

UPDATE submissions
SET title = COALESCE(NULLIF(title_en, ''), title_vi, title)
WHERE title IS NULL OR title = '';
