import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(import.meta.dirname, "../.env.test") });

const relayUrl = process.env.VITE_TEST_RELAY ?? "ws://localhost:7777";
const rootDir = path.resolve(import.meta.dirname, "../..");

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : undefined,

  use: {
    baseURL: "http://localhost:5173",
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "retain-on-failure",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  globalSetup: "./global-setup.ts",

  webServer: {
    command: `cd ${rootDir} && vite build --mode test && vite preview --port 5173`,
    url: "http://localhost:5173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      VITE_TEST_RELAY: relayUrl,
    },
  },

  reporter: [
    ["html", { outputFolder: "../../playwright-report" }],
    ["list"],
  ],
});
