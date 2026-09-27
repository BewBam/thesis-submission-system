import { defineConfig } from "@playwright/test";

const remote = Boolean(process.env.PORTAL_URL);
const portalUrl = process.env.PORTAL_URL || "http://127.0.0.1:5174";

export default defineConfig({
  testDir: "./playwright",
  timeout: 120000,
  reporter: [["list"], ["./playwright/markdown-reporter.ts"]],
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: portalUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  globalSetup: "./playwright/global-setup.ts",
  webServer: remote
    ? undefined
    : [
        {
          command: "npm run start:dev",
          cwd: "backend",
          env: {
            ...process.env,
            PORT: "3001",
            DB_HOST: "127.0.0.1",
            DB_PORT: "5433",
            POSTGRES_DB: "thesis_test",
            POSTGRES_USER: "thesis_user",
            POSTGRES_PASSWORD: "thesis_pass",
            JWT_SECRET: "dev-secret-change-me",
            EMAIL_ENABLED: "false",
            DATABASE_URL: "",
            DSPACE_API_BASE_URL: "",
            DSPACE_API_USER: "",
            DSPACE_API_PASSWORD: "",
            DSPACE_API_TOKEN: ""
          },
          url: "http://127.0.0.1:3001/health",
          reuseExistingServer: false,
          timeout: 180000
        },
        {
          command: "npm run dev -- --port 5174 --host 127.0.0.1",
          cwd: "frontend",
          env: {
            ...process.env,
            API_PROXY_TARGET: "http://127.0.0.1:3001"
          },
          url: "http://127.0.0.1:5174",
          reuseExistingServer: false,
          timeout: 180000
        }
      ]
});
