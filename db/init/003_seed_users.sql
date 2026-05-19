-- Demo accounts (development). Replace with real provisioning in production.

INSERT INTO users (id, username, password, display_name, role) VALUES
  ('11111111-1111-1111-1111-111111111101', 'student1', 'student123', 'Student Alpha', 'student'),
  ('11111111-1111-1111-1111-111111111102', 'student2', 'student123', 'Student Beta', 'student'),
  ('11111111-1111-1111-1111-111111111103', 'student3', 'student123', 'Student Gamma', 'student'),
  ('22222222-2222-2222-2222-222222222201', 'reviewer1', 'review123', 'Reviewer One', 'reviewer'),
  ('22222222-2222-2222-2222-222222222202', 'reviewer2', 'review123', 'Reviewer Two', 'reviewer'),
  ('22222222-2222-2222-2222-222222222203', 'reviewer3', 'review123', 'Reviewer Three', 'reviewer'),
  ('33333333-3333-3333-3333-333333333301', 'admin1', 'admin123', 'Admin One', 'admin'),
  ('44444444-4444-4444-4444-444444444401', 'library1', 'library123', 'Library Staff One', 'library_staff'),
  ('55555555-5555-5555-5555-555555555501', 'director1', 'director123', 'Library Director', 'director')
ON CONFLICT (username) DO NOTHING;
