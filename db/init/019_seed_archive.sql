-- Demo university, faculties (HCMUT schools), semesters, and open submission periods.

INSERT INTO universities (id, code, name, status) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'HCMUT', 'Trường Đại học Bách khoa TP.HCM', 'active')
ON CONFLICT (code) DO NOTHING;

INSERT INTO faculties (id, university_id, code, name, status) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'CIVIL', 'CIVIL ENGINEERING', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'GEOPE', 'GEOLOGY AND PETROLEUM ENGINEERING', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'APPLSCI', 'APPLIED SCIENCE', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'MECH', 'MECHANICAL ENGINEERING', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'MATTECH', 'MATERIAL TECHNOLOGY', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'TRANSP', 'TRANSPORTATION ENGINEERING', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'CSE', 'COMPUTER SCIENCE AND ENGINEERING', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'CHEM', 'CHEMICAL ENGINEERING', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'SIM', 'SCHOOL OF INDUSTRIAL MANAGEMENT', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'ENR', 'ENVIRONMENT AND NATURAL RESOURCES', 'active'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaa0001', 'EEE', 'ELECTRICAL AND ELECTRONICS ENGINEERING', 'active')
ON CONFLICT (university_id, code) DO UPDATE SET name = EXCLUDED.name, status = 'active';

INSERT INTO semesters (id, faculty_id, code, name, status) VALUES
  ('cccccccc-cccc-cccc-cccc-cccccccc0001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001', '2025-1', 'Semester 1 — 2025', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0002', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002', '2025-1', 'Semester 1 — 2025', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003', '2025-1', 'Semester 1 — 2025', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0004', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004', '2025-1', 'Semester 1 — 2025', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0005', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005', '2025-1', 'Semester 1 — 2025', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0006', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006', '2025-1', 'Semester 1 — 2025', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0007', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0007', '2025-1', 'Semester 1 — 2025', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0008', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008', '2025-1', 'Semester 1 — 2025', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0009', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0009', '2025-1', 'Semester 1 — 2025', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0010', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010', '2025-1', 'Semester 1 — 2025', 'active'),
  ('cccccccc-cccc-cccc-cccc-cccccccc0011', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011', '2025-1', 'Semester 1 — 2025', 'active')
ON CONFLICT (faculty_id, code) DO NOTHING;

INSERT INTO submission_periods (id, faculty_id, semester_id, name, opens_at, closes_at, status, allow_resubmit) VALUES
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0001',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0001',
    'cccccccc-cccc-cccc-cccc-cccccccc0001',
    'Thesis deposit — HK1/2025 — Civil Engineering',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '90 days',
    'open',
    TRUE
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0002',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0002',
    'cccccccc-cccc-cccc-cccc-cccccccc0002',
    'Thesis deposit — HK1/2025 — Geology and Petroleum Engineering',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '90 days',
    'open',
    TRUE
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0003',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0003',
    'cccccccc-cccc-cccc-cccc-cccccccc0003',
    'Thesis deposit — HK1/2025 — Applied Science',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '90 days',
    'open',
    TRUE
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0004',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0004',
    'cccccccc-cccc-cccc-cccc-cccccccc0004',
    'Thesis deposit — HK1/2025 — Mechanical Engineering',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '90 days',
    'open',
    TRUE
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0005',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0005',
    'cccccccc-cccc-cccc-cccc-cccccccc0005',
    'Thesis deposit — HK1/2025 — Material Technology',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '90 days',
    'open',
    TRUE
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0006',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0006',
    'cccccccc-cccc-cccc-cccc-cccccccc0006',
    'Thesis deposit — HK1/2025 — Transportation Engineering',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '90 days',
    'open',
    TRUE
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0007',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0007',
    'cccccccc-cccc-cccc-cccc-cccccccc0007',
    'Thesis deposit — HK1/2025 — Computer Science and Engineering',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '90 days',
    'open',
    TRUE
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0008',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0008',
    'cccccccc-cccc-cccc-cccc-cccccccc0008',
    'Thesis deposit — HK1/2025 — Chemical Engineering',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '90 days',
    'open',
    TRUE
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0009',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0009',
    'cccccccc-cccc-cccc-cccc-cccccccc0009',
    'Thesis deposit — HK1/2025 — School of Industrial Management',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '90 days',
    'open',
    TRUE
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0010',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0010',
    'cccccccc-cccc-cccc-cccc-cccccccc0010',
    'Thesis deposit — HK1/2025 — Environment and Natural Resources',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '90 days',
    'open',
    TRUE
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddd0011',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbb0011',
    'cccccccc-cccc-cccc-cccc-cccccccc0011',
    'Thesis deposit — HK1/2025 — Electrical and Electronics Engineering',
    NOW() - INTERVAL '7 days',
    NOW() + INTERVAL '90 days',
    'open',
    TRUE
  )
ON CONFLICT (id) DO NOTHING;
