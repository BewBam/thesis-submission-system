import { execSync } from "child_process";
import path from "path";

export default function globalSetup() {
  if (process.env.PORTAL_URL || process.env.API_URL) {
    if (!process.env.PORTAL_URL || !process.env.API_URL) {
      throw new Error("Remote tests need both PORTAL_URL and API_URL.");
    }
    return;
  }
  execSync("node test/prepare-db.js", {
    cwd: path.join(process.cwd(), "backend"),
    stdio: "inherit",
    env: {
      ...process.env,
      DB_HOST: process.env.DB_HOST || "127.0.0.1",
      DB_PORT: process.env.DB_PORT || "5433",
      POSTGRES_USER: process.env.POSTGRES_USER || "thesis_user",
      POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD || "thesis_pass"
    }
  });
}
