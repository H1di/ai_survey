const { defineConfig, devices } = require("@playwright/test");

// Keys blanked on purpose, and SKIP_DOTENV stops the backend reading
// backend/.env at all: server.js drops a blank OPENAI_API_KEY before dotenv
// runs, so blanking alone would let a developer's real key back in. Vite never
// overrides variables that already exist, so the blank VITE_* values hold.
const KEYLESS_ENV = {
  SKIP_DOTENV: "1",
  OPENAI_API_KEY: "",
  ONET_API_KEY: "",
  SUPABASE_URL: "",
  SUPABASE_SERVICE_ROLE_KEY: "",
  VITE_SUPABASE_URL: "",
  VITE_SUPABASE_ANON_KEY: "",
  DEV_TOOLS_TOKEN: "",
  UPSTASH_REDIS_REST_URL: "",
  UPSTASH_REDIS_REST_TOKEN: "",
  PORT: "3001",
  NODE_ENV: "production",
};

module.exports = defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3001",
    reducedMotion: "reduce",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Production shape: Express serves frontend/dist next to /api, as on Render.
  webServer: {
    command: "npm run build && npm start --prefix backend",
    url: "http://localhost:3001/api/health",
    timeout: 180_000,
    reuseExistingServer: false,
    env: KEYLESS_ENV,
  },
});
