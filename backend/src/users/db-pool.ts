import { Pool } from "pg";

export function createPgPool() {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false
    });
  }

  return new Pool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.POSTGRES_DB || "thesis_portal",
    user: process.env.POSTGRES_USER || "thesis_user",
    password: process.env.POSTGRES_PASSWORD || "thesis_pass"
  });
}