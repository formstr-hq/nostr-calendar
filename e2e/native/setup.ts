// Native E2E setup: starts the relay, seeds it, then builds + installs the
// test APK (baking in the emulator-accessible relay URL).
//
// Usage: run via `pnpm test:e2e:native` or directly with tsx.

import { execSync, spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { seedRelay } from "../relay/seed/seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const relayDir = resolve(__dirname, "../relay");
const projectDir = resolve(__dirname, "../../");

// Android emulator accesses host localhost via 10.0.2.2
const NATIVE_RELAY_URL = "ws://10.0.2.2:7777";
const HOST_RELAY_URL = "ws://localhost:7777";

function run(cmd: string, opts?: { cwd?: string }): void {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: opts?.cwd ?? projectDir });
}

async function waitForRelay(url: string, maxMs = 30_000): Promise<void> {
  const { WebSocket } = await import("ws");
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(url);
        ws.once("open", () => { ws.close(); resolve(); });
        ws.once("error", reject);
        setTimeout(() => { ws.close(); reject(new Error("timeout")); }, 2_000);
      });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1_000));
    }
  }
  throw new Error(`Relay not ready at ${url} after ${maxMs}ms`);
}

export async function setup(): Promise<void> {
  console.log("▶ Starting strfry relay...");
  run("docker compose up -d", { cwd: relayDir });
  await waitForRelay(HOST_RELAY_URL);

  console.log("▶ Seeding relay with test data...");
  await seedRelay(HOST_RELAY_URL);

  console.log("▶ Building web bundle with test relay...");
  run(`VITE_TEST_RELAY=${NATIVE_RELAY_URL} pnpm build`);

  console.log("▶ Syncing Capacitor...");
  run("pnpm cap sync android");

  console.log("▶ Building debug APK...");
  run("./gradlew assembleDebug", { cwd: resolve(projectDir, "android") });

  console.log("▶ Installing APK on emulator...");
  const apk = resolve(projectDir, "android/app/build/outputs/apk/debug/app-debug.apk");
  run(`adb install -r ${apk}`);

  console.log("▶ Granting notification permission...");
  spawnSync("adb", ["shell", "pm", "grant", "app.formstr.calendar", "android.permission.POST_NOTIFICATIONS"], { stdio: "inherit" });

  console.log("✓ Native E2E setup complete");
}

export async function teardown(): Promise<void> {
  console.log("▶ Stopping relay...");
  execSync("docker compose down", { cwd: relayDir, stdio: "inherit" });
}
