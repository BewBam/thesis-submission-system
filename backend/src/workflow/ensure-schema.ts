import type { Pool } from "pg";

const STRUCTURAL_FIELDS: Array<{
  id: string;
  fieldKey: string;
  label: string;
  inputType: string;
  required: boolean;
  sortOrder: number;
}> = [
  { id: "b1000001-0001-4000-8000-000000000001", fieldKey: "archiveFacultyId", label: "Faculty", inputType: "select", required: true, sortOrder: 1 },
  { id: "b1000001-0001-4000-8000-000000000002", fieldKey: "archiveSemesterId", label: "Semester", inputType: "select", required: true, sortOrder: 2 },
  { id: "b1000001-0001-4000-8000-000000000003", fieldKey: "submissionPeriodId", label: "Submission period", inputType: "select", required: true, sortOrder: 3 },
  { id: "b1000001-0001-4000-8000-000000000004", fieldKey: "email", label: "Email", inputType: "text", required: false, sortOrder: 4 },
  { id: "b1000001-0001-4000-8000-000000000005", fieldKey: "titleVi", label: "Thesis title (Vietnamese)", inputType: "text", required: true, sortOrder: 5 },
  { id: "b1000001-0001-4000-8000-000000000006", fieldKey: "titleEn", label: "Thesis title (English)", inputType: "text", required: true, sortOrder: 6 },
  { id: "b1000001-0001-4000-8000-000000000007", fieldKey: "thesisAdvisors", label: "Advisor(s)", inputType: "text", required: true, sortOrder: 7 },
  { id: "b1000001-0001-4000-8000-000000000008", fieldKey: "major", label: "Major", inputType: "text", required: true, sortOrder: 8 },
  { id: "b1000001-0001-4000-8000-000000000009", fieldKey: "thesisYear", label: "Year", inputType: "year", required: true, sortOrder: 9 },
  { id: "b1000001-0001-4000-8000-000000000010", fieldKey: "authorIds", label: "Authors", inputType: "select", required: true, sortOrder: 11 },
  { id: "b1000001-0001-4000-8000-000000000011", fieldKey: "reviewerIds", label: "Reviewers", inputType: "select", required: true, sortOrder: 12 },
  { id: "b1000001-0001-4000-8000-000000000012", fieldKey: "thesisFile", label: "Thesis PDF", inputType: "file", required: true, sortOrder: 13 }
];

export async function ensurePortalSchema(db: Pool) {
  await db.query(`ALTER TABLE submissions ADD COLUMN IF NOT EXISTS current_step INT`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS workflow_steps (
      id UUID PRIMARY KEY,
      sort_order INT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('reviewer', 'library_staff', 'director')),
      label TEXT NOT NULL DEFAULT ''
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS submission_steps (
      id UUID PRIMARY KEY,
      submission_id UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      sort_order INT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('reviewer', 'library_staff', 'director')),
      label TEXT NOT NULL DEFAULT '',
      UNIQUE (submission_id, sort_order)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_groups (
      id UUID PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('student', 'reviewer')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS user_group_members (
      group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
      PRIMARY KEY (group_id, user_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS reviewer_group_grants (
      reviewer_group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
      student_group_id UUID NOT NULL REFERENCES user_groups(id) ON DELETE CASCADE,
      PRIMARY KEY (reviewer_group_id, student_group_id)
    )
  `);

  await db.query(`
    DO $$
    DECLARE
      cname text;
    BEGIN
      SELECT conname INTO cname
      FROM pg_constraint
      WHERE conrelid = 'submission_form_fields'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) ILIKE '%input_type%';
      IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE submission_form_fields DROP CONSTRAINT %I', cname);
      END IF;
    END $$
  `);
  await db.query(`
    ALTER TABLE submission_form_fields
    ADD CONSTRAINT submission_form_fields_input_type_check
    CHECK (input_type IN ('text', 'textarea', 'select', 'year', 'file'))
  `);

  const existing = await db.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM workflow_steps`);
  if (Number(existing.rows[0]?.count || 0) === 0) {
    await db.query(`
      INSERT INTO workflow_steps (id, sort_order, role, label) VALUES
        ('c1000001-0001-4000-8000-000000000001', 1, 'reviewer', 'Review'),
        ('c1000001-0001-4000-8000-000000000002', 2, 'library_staff', 'Library'),
        ('c1000001-0001-4000-8000-000000000003', 3, 'director', 'Director')
    `);
  }

  for (const field of STRUCTURAL_FIELDS) {
    await db.query(
      `INSERT INTO submission_form_fields (
         id, field_key, label, dspace_path, input_type, required, enabled, sort_order,
         options, default_value, storage, column_name, system_locked
       ) VALUES ($1, $2, $3, '', $4, $5, TRUE, $6, '[]'::jsonb, '', 'extra', NULL, FALSE)
       ON CONFLICT (field_key) DO NOTHING`,
      [field.id, field.fieldKey, field.label, field.inputType, field.required, field.sortOrder]
    );
  }

  await db.query(`UPDATE submission_form_fields SET system_locked = FALSE`);
}
