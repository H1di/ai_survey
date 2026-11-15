const { defineConfig, devices } = require("@playwright/test");

// Keys blanked on purpose: dotenv and Vite never override variables that
// already exist, so a developer's real .env cannot turn this keyless run
// into one that reaches OpenAI, O*NET, Supabase or Redis.
const KEYLESS_ENV = {
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
