import { finalizeEvent, type UnsignedEvent } from "nostr-tools";
import { Relay } from "nostr-tools/relay";
import { TEST_KEYS } from "./keys.js";

const CALENDAR_EVENT_KIND = 31923;

export async function seedRelay(relayUrl: string): Promise<void> {
  const relay = new Relay(relayUrl);
  await relay.connect();

  const alice = TEST_KEYS.alice;
  const tomorrow = Math.floor(Date.now() / 1000) + 86400;

  // Kind-0 profiles so participant / booker names render instead of npubs.
  for (const [name, key] of [
    ["Alice", TEST_KEYS.alice],
    ["Bob", TEST_KEYS.bob],
    ["Carol", TEST_KEYS.carol],
  ] as const) {
    const profile: UnsignedEvent = {
      kind: 0,
      pubkey: key.pubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify({ name }),
    };
    await relay.publish(finalizeEvent(profile, key.secretBytes));
  }

  // One public calendar event by Alice — used by future tests that need a
  // pre-existing event on the calendar.
  const unsigned: UnsignedEvent = {
    kind: CALENDAR_EVENT_KIND,
    pubkey: alice.pubkey,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", "seed-event-01"],
      ["title", "Seeded Test Event"],
      ["start", String(tomorrow)],
      ["end", String(tomorrow + 3600)],
    ],
    content: "A seeded event for E2E tests",
  };

  const signed = finalizeEvent(unsigned, alice.secretBytes);
  await relay.publish(signed);

  relay.close();
}
