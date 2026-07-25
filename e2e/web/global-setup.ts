import { createMockRelay } from "nostr-mock-relay";
import { seedRelay } from "../relay/seed/seed.js";

export default async function globalSetup() {
  const relayUrl = process.env.VITE_TEST_RELAY ?? "ws://localhost:7780";
  const port = Number(new URL(relayUrl).port);
  const relay = createMockRelay({ port });
  await relay.start();

  await seedRelay(relayUrl);

  return async () => {
    await relay.stop();
  };
}
