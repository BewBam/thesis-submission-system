CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_settings (key, value, description) VALUES
  ('thesis_max_file_size_mb', '30', 'Maximum thesis PDF upload size in megabytes'),
  ('submission_timezone', 'Asia/Ho_Chi_Minh', 'Timezone for submission period open/close times'),
  ('library_support_phone', '3864 7256 (5419)', 'Library reference desk contact for deposit support'),
  ('maintenance_mode', 'false', 'When true, only administrators can sign in')
ON CONFLICT (key) DO NOTHING;
