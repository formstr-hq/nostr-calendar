import { finalizeEvent, type UnsignedEvent, type Event } from "nostr-tools";
import { Relay } from "nostr-tools/relay";
import type { TestKey } from "./keys.js";

const CALENDAR_EVENT_KIND = 31923;

/** Signs `event` with `author` and publishes it to the relay. */
export async function publishEvent(
  relayUrl: string,
  author: TestKey,
  event: Omit<UnsignedEvent, "pubkey" | "created_at"> & { created_at?: number },
): Promise<Event> {
  const relay = new Relay(relayUrl);
  await relay.connect();
  try {
    const signed = finalizeEvent(
      {
        created_at: Math.floor(Date.now() / 1000),
        ...event,
        pubkey: author.pubkey,
      },
      author.secretBytes,
    );
    await relay.publish(signed);
    return signed;
  } finally {
    relay.close();
  }
}

/**
 * Publishes a public kind-31923 calendar event so tests don't have to drive
 * the event editor UI just to get a pre-existing event. `participants` become
 * "p" tags, which is what makes the event show up as a pending invitation for
 * those users.
 */
export async function seedCalendarEvent(
  relayUrl: string,
  author: TestKey,
  {
    title,
    startUnix,
    durationSecs = 3600,
    dTag = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    participants = [],
    description = "",
  }: {
    title: string;
    startUnix: number;
    durationSecs?: number;
    dTag?: string;
    participants?: TestKey[];
    description?: string;
  },
): Promise<Event> {
  return publishEvent(relayUrl, author, {
    kind: CALENDAR_EVENT_KIND,
    tags: [
      ["d", dTag],
      ["title", title],
      ["start", String(startUnix)],
      ["end", String(startUnix + durationSecs)],
      ...participants.map((p) => ["p", p.pubkey]),
    ],
    content: description,
  });
}

/** The relay URL tests should publish to (same one the app is pointed at). */
export function testRelayUrl(): string {
  return process.env.VITE_TEST_RELAY ?? "ws://localhost:7780";
}
