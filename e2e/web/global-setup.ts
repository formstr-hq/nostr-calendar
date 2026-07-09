import { createMockRelay } from "nostr-mock-relay";
import { seedRelay } from "../relay/seed/seed.js";

export default async function globalSetup() {
  const relay = createMockRelay({ port: 7777 });
  await relay.start();

  await seedRelay(relay.url);

  return async () => {
    await relay.stop();
  };
}
