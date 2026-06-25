import { execSync } from "child_process";
import { seedRelay } from "../relay/seed/seed.js";
import path from "path";

const relayDir = path.resolve(import.meta.dirname, "../relay");
const relayUrl = process.env.VITE_TEST_RELAY ?? "ws://localhost:7777";

export default async function globalSetup() {
  // 1. Start the relay
  execSync("docker compose up -d", { cwd: relayDir, stdio: "inherit" });
  await waitForRelay(relayUrl);

  // 2. Seed deterministic test events
  await seedRelay(relayUrl);
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
