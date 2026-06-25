import { execSync } from "child_process";
import path from "path";

const relayDir = path.resolve(import.meta.dirname, "../relay");

export default async function globalTeardown() {
  execSync("docker compose down", { cwd: relayDir, stdio: "inherit" });
}
