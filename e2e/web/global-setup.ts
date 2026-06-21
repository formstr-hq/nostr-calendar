import { execSync } from "child_process";
import { chromium } from "@playwright/test";
import { seedRelay } from "../relay/seed/seed.js";
import { TEST_KEYS } from "../relay/seed/keys.js";
import path from "path";

const relayDir = path.resolve(import.meta.dirname, "../relay");
const relayUrl = process.env.VITE_TEST_RELAY ?? "ws://localhost:7777";
const AUTH_STATE_PATH = path.resolve(import.meta.dirname, "../../.auth/alice.json");

export default async function globalSetup() {
  // 1. Start the relay
  execSync("docker compose up -d", { cwd: relayDir, stdio: "inherit" });
  await waitForRelay(relayUrl);

  // 2. Seed deterministic test events
  await seedRelay(relayUrl);

  // 3. Build Alice's auth storageState by injecting her legacy key into
  //    localStorage before the app loads. The app's restoreFromStorage()
  //    reads `calendar:keys` and creates a LocalSigner from it, so no
  //    NIP-07 mock or active login flow is needed.
  const alice = TEST_KEYS.alice;
  const browser = await chromium.launch();
  const context = await browser.newContext();

  await context.addInitScript(
    ({ keysKey, cacheKey, secret, pubkey }) => {
      localStorage.setItem(keysKey, JSON.stringify({ pubkey, secret }));
      localStorage.setItem(cacheKey, JSON.stringify({ pubkey, name: "Alice Test" }));
    },
    {
      keysKey: "calendar:keys",
      cacheKey: "calendar:userData",
      secret: alice.secretHex,
      pubkey: alice.pubkey,
    },
  );

  const page = await context.newPage();
  await page.goto("http://localhost:5173");
  await page.screenshot()
  // Wait for the app to restore Alice's session from localStorage
  await page.getByTestId("user-avatar").waitFor({ state: "visible", timeout: 15_000 });

  await context.storageState({ path: AUTH_STATE_PATH });
  await browser.close();
}

async function waitForRelay(url: string, timeoutMs = 30_000): Promise<void> {
  const httpUrl = url.replace(/^ws/, "http");
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(httpUrl);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error(`Relay at ${url} did not become ready within ${timeoutMs}ms`);
}
