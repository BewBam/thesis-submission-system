-- Ensure reviews.id is always populated even when inserts omit it.

UPDATE reviews SET id = gen_random_uuid() WHERE id IS NULL;

ALTER TABLE reviews ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE reviews ALTER COLUMN id SET NOT NULL;
