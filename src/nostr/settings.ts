import type { Event, UnsignedEvent } from "nostr-tools";
import { EventKinds } from "./kinds";
import { getUserPublicKey, signerDecrypt, signerEncrypt } from "./crypto";
import { buildAndSign, nextCreatedAt, publishSignedEvent } from "./core";
import { fetchLatest } from "./fetch";
import type { GeneralSettings } from "../stores/settings";

export const GENERAL_SETTINGS_D_TAG = "calendar/general_settings";

export async function fetchGeneralSettings(
  pubkey: string,
): Promise<{ settings: Partial<GeneralSettings>; event: Event } | null> {
  const event = await fetchLatest([
    {
      kinds: [EventKinds.ApplicationData],
      authors: [pubkey],
      "#d": [GENERAL_SETTINGS_D_TAG],
      limit: 1,
    },
  ]);
  if (!event?.content) return null;

  return {
    settings: await signerDecrypt<Partial<GeneralSettings>>(
      event.pubkey,
      event.content,
    ),
    event,
  };
}

export async function publishGeneralSettings(
  settings: GeneralSettings,
  previousCreatedAt = 0,
): Promise<Event> {
  const pubkey = await getUserPublicKey();
  const unsigned: UnsignedEvent = {
    kind: EventKinds.ApplicationData,
    pubkey,
    created_at: nextCreatedAt(previousCreatedAt),
    tags: [["d", GENERAL_SETTINGS_D_TAG]],
    content: await signerEncrypt(pubkey, settings),
  };
  const event = await buildAndSign(unsigned);
  await publishSignedEvent(event);
  return event;
}
