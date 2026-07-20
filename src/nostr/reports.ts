import { Event, UnsignedEvent } from "nostr-tools";
import { EventKinds } from "./kinds";
import { getUserPublicKey } from "./crypto";
import { buildAndSign, publishSignedEvent } from "./core";
import { fetchAll } from "./fetch";

export type ReportType =
  | "nudity"
  | "malware"
  | "profanity"
  | "illegal"
  | "spam"
  | "impersonation"
  | "other";

/**
 * Publishes a NIP-56 report event (kind 1984) for a calendar event.
 * Tags the author's pubkey and the addressable coordinate of the event.
 */
export async function publishReportEvent(params: {
  authorPubkey: string;
  eventCoordinate: string;
  relayHint?: string;
  reportType: ReportType;
  content?: string;
}): Promise<Event> {
  const userPublicKey = await getUserPublicKey();
  const tags: string[][] = [
    ["p", params.authorPubkey, params.reportType],
    params.relayHint
      ? ["a", params.eventCoordinate, params.relayHint, params.reportType]
      : ["a", params.eventCoordinate, params.reportType],
  ];

  const unsigned: UnsignedEvent = {
    pubkey: userPublicKey,
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.ReportEvent,
    content: params.content ?? "",
    tags,
  };

  const signed = await buildAndSign(unsigned);
  await publishSignedEvent(signed);
  return signed;
}

/**
 * Fetches the current user's NIP-56 report events (kind 1984) filtered
 * by a list of calendar event coordinates. Used to suppress already-reported
 * invitations on load.
 */
export async function fetchUserReports(
  userPubkey: string,
  eventCoordinates: string[],
): Promise<string[]> {
  if (eventCoordinates.length === 0) return [];
  const events = await fetchAll([
    {
      kinds: [EventKinds.ReportEvent],
      authors: [userPubkey],
      "#a": eventCoordinates,
    },
  ]);
  return events.flatMap((event) =>
    event.tags.filter((t) => t[0] === "a" && t[1]).map((t) => t[1]),
  );
}
