const { readdirSync, readFileSync } = require("fs");
const path = require("path");
const { Client } = require("pg");

const TEST_COMMUNITY_ID = "11111111-aaaa-4aaa-8aaa-000000000001";
const TEST_COLLECTION_ID = "11111111-aaaa-4aaa-8aaa-111111111111";

function dbConfig(database) {
  return {
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 5433),
    user: process.env.POSTGRES_USER || "thesis_user",
    password: process.env.POSTGRES_PASSWORD || "thesis_pass",
    database
  };
}

async function prepareTestDatabase() {
  if (process.env.API_URL) {
    console.log("API_URL is set; skip creating thesis_test");
    return;
  }

  const admin = new Client(dbConfig("postgres"));
  await admin.connect();
  await admin.query(
    `SELECT pg_terminate_backend(pid)
     FROM pg_stat_activity
     WHERE datname = 'thesis_test' AND pid <> pg_backend_pid()`
  );
  await admin.query("DROP DATABASE IF EXISTS thesis_test");
  await admin.query("CREATE DATABASE thesis_test");
  await admin.end();

  const db = new Client(dbConfig("thesis_test"));
  await db.connect();
  const dir = path.join(__dirname, "..", "..", "db", "init");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(path.join(dir, file), "utf8");
    try {
      await db.query(sql);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${file}: ${message}`);
    }
  }

  await db.query(
    `UPDATE system_settings
     SET value = '', updated_at = NOW()
     WHERE key IN (
       'dspace_api_base_url',
       'dspace_api_user',
       'dspace_api_password',
       'dspace_api_token'
     )`
  );
  await db.query(
    `INSERT INTO faculties (id, name, status)
     VALUES (
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
       'Automation Faculty',
       'active'
     )
     ON CONFLICT (id) DO NOTHING`
  );
  await db.query(
    `INSERT INTO semesters (id, faculty_id, name, status)
     VALUES (
       'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
       'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01',
       'Automation Semester',
       'active'
     )
     ON CONFLICT (id) DO NOTHING`
  );
  await db.query(
    `INSERT INTO submission_periods (
       id, semester_id, name, opens_at, closes_at, status, allow_resubmit
     ) VALUES (
       'dddddddd-dddd-4ddd-8ddd-dddddddddd01',
       'cccccccc-cccc-4ccc-8ccc-cccccccccc01',
       'Automation Period',
       NOW() - INTERVAL '1 day',
       NOW() + INTERVAL '365 days',
       'open',
       TRUE
     )
     ON CONFLICT (id) DO NOTHING`
  );
  await db.query(
    `INSERT INTO dspace_sync_nodes (
       dspace_id, root_community_id, parent_dspace_id, node_type, name, depth, path
     ) VALUES
       ($1, $1, NULL, 'community', 'Test Community', 0, 'Test Community'),
       ($2, $1, $1, 'collection', 'Test Collection', 1, 'Test Community / Test Collection')
     ON CONFLICT (dspace_id) DO NOTHING`,
    [TEST_COMMUNITY_ID, TEST_COLLECTION_ID]
  );
  await db.end();
  console.log("thesis_test is ready");
}

module.exports = prepareTestDatabase;
module.exports.TEST_COLLECTION_ID = TEST_COLLECTION_ID;

if (require.main === module) {
  prepareTestDatabase().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
