import { Pool } from "pg";

export function createPgPool() {
  return new Pool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.POSTGRES_DB || "thesis_portal",
    user: process.env.POSTGRES_USER || "thesis_user",
    password: process.env.POSTGRES_PASSWORD || "thesis_pass"
  });
}
