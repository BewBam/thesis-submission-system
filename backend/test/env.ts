if (!process.env.API_URL) {
  process.env.DB_HOST = process.env.DB_HOST || "127.0.0.1";
  process.env.DB_PORT = process.env.DB_PORT || "5433";
  process.env.POSTGRES_DB = "thesis_test";
  process.env.POSTGRES_USER = process.env.POSTGRES_USER || "thesis_user";
  process.env.POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || "thesis_pass";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
  process.env.EMAIL_ENABLED = "false";
  process.env.DATABASE_URL = "";
  process.env.DSPACE_API_BASE_URL = "";
  process.env.DSPACE_API_USER = "";
  process.env.DSPACE_API_PASSWORD = "";
  process.env.DSPACE_API_TOKEN = "";
}
