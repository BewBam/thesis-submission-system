-- Apply HCMUT faculty list on databases that still have the old CNTT/CK seed.
-- Fresh installs already get data from 019_seed_archive.sql.

UPDATE faculties SET status = 'inactive'
WHERE university_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001'
  AND code IN ('CNTT', 'CK');

INSERT INTO faculties (id, university_id, code, name, status) VALUES
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'CIVIL', 'CIVIL ENGINEERING', 'active'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'GEOPE', 'GEOLOGY AND PETROLEUM ENGINEERING', 'active'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'APPLSCI', 'APPLIED SCIENCE', 'active'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'MECH', 'MECHANICAL ENGINEERING', 'active'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'MATTECH', 'MATERIAL TECHNOLOGY', 'active'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'TRANSP', 'TRANSPORTATION ENGINEERING', 'active'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'CSE', 'COMPUTER SCIENCE AND ENGINEERING', 'active'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'CHEM', 'CHEMICAL ENGINEERING', 'active'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'SIM', 'SCHOOL OF INDUSTRIAL MANAGEMENT', 'active'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'ENR', 'ENVIRONMENT AND NATURAL RESOURCES', 'active'),
  (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'EEE', 'ELECTRICAL AND ELECTRONICS ENGINEERING', 'active')
ON CONFLICT (university_id, code) DO UPDATE SET name = EXCLUDED.name, status = 'active';

INSERT INTO semesters (id, faculty_id, code, name, status)
SELECT gen_random_uuid(), f.id, '2025-1', 'Semester 1 — 2025', 'active'
FROM faculties f
WHERE f.code IN ('CIVIL', 'GEOPE', 'APPLSCI', 'MECH', 'MATTECH', 'TRANSP', 'CSE', 'CHEM', 'SIM', 'ENR', 'EEE')
  AND f.status = 'active'
ON CONFLICT (faculty_id, code) DO NOTHING;

INSERT INTO submission_periods (id, faculty_id, semester_id, name, opens_at, closes_at, status, allow_resubmit)
SELECT
  gen_random_uuid(),
  f.id,
  s.id,
  'Thesis deposit — HK1/2025 — ' || f.name,
  NOW() - INTERVAL '7 days',
  NOW() + INTERVAL '90 days',
  'open',
  TRUE
FROM faculties f
JOIN semesters s ON s.faculty_id = f.id AND s.code = '2025-1'
WHERE f.code IN ('CIVIL', 'GEOPE', 'APPLSCI', 'MECH', 'MATTECH', 'TRANSP', 'CSE', 'CHEM', 'SIM', 'ENR', 'EEE')
  AND f.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM submission_periods sp
    WHERE sp.faculty_id = f.id AND sp.semester_id = s.id AND sp.status = 'open'
  );

UPDATE semesters SET collection_name = 'Luận văn – ' || code
WHERE collection_name = '' OR collection_name IS NULL;

UPDATE semesters SET dspace_collection_id = COALESCE(dspace_collection_id, 'dev-collection-' || id::text)
WHERE dspace_collection_id IS NULL;

UPDATE faculties SET dspace_sync_status = 'synced',
  dspace_community_id = COALESCE(dspace_community_id, 'dev-community-' || id::text)
WHERE status = 'active' AND (dspace_community_id IS NULL OR dspace_community_id = '');

UPDATE semesters SET dspace_sync_status = 'synced',
  dspace_community_id = COALESCE(dspace_community_id, 'dev-semester-' || id::text)
WHERE dspace_community_id IS NULL OR dspace_community_id = '';
