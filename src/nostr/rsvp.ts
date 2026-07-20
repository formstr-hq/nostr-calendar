import { Event, nip19, Filter } from "nostr-tools";
import { dataLayer, type ObserveHandle } from "@formstr/local-relay";
import { EventKinds } from "./kinds";
import { getUserPublicKey, selfEncrypt, selfDecrypt } from "./crypto";
import {
  buildAndSign,
  publishSignedEvent,
  makeDTag,
  addGossipRelays,
} from "./core";
import { RSVPStatus } from "../utils/types";
import type { NSec } from "nostr-tools/nip19";

export interface RSVPPayload {
  status: RSVPStatus; // accepted | declined | tentative
  suggestedStart?: number; // unix seconds
  suggestedEnd?: number; // unix seconds
  comment?: string;
}

/**
 * RSVP record returned by RSVP fetch helpers. Carries the questionnaire
 * data (status + suggested times + free-text comment) along with the
 * responder's pubkey and the event coordinate the RSVP refers to.
 */
export interface RSVPRecord {
  pubkey: string; // responder
  status: RSVPStatus;
  suggestedStart?: number; // unix seconds
  suggestedEnd?: number; // unix seconds
  comment: string;
  createdAt: number;
  eventCoord: string; // "<kind>:<authorPubkey>:<dTag>"
}

/**
 * Builds NIP-52-style RSVP tags carrying the questionnaire data:
 *
 *   ["a", "<kind>:<authorPubkey>:<dTag>", relayHint?]
 *   ["status", "accepted"|"declined"|"tentative"]
 *   ["start", "<unix>"]?
 *   ["end",   "<unix>"]?
 *
 * The free-text comment is placed in `content` by the public RSVP publisher.
 */
function buildRSVPTags(opts: {
  referenceKind: number;
  authorPubKey: string;
  eventDTag: string;
  relayHint?: string;
  payload: RSVPPayload;
}): string[][] {
  const aValue = `${opts.referenceKind}:${opts.authorPubKey}:${opts.eventDTag}`;
  const tags: string[][] = [
    opts.relayHint ? ["a", aValue, opts.relayHint] : ["a", aValue],
    ["status", opts.payload.status],
  ];
  if (opts.payload.suggestedStart) {
    tags.push(["start", String(opts.payload.suggestedStart)]);
  }
  if (opts.payload.suggestedEnd) {
    tags.push(["end", String(opts.payload.suggestedEnd)]);
  }
  return tags;
}

function getRsvpDTag(
  responderPubkey: string,
  authorPubKey: string,
  eventId: string,
) {
  return makeDTag(`${responderPubkey}:${authorPubKey}:${eventId}`);
}

function normalizeRsvpPayload(
  payload: Partial<RSVPPayload> | null | undefined,
): Pick<
  RSVPRecord,
  "status" | "suggestedStart" | "suggestedEnd" | "comment"
> | null {
  if (!payload) return null;
  if (
    payload.status !== RSVPStatus.accepted &&
    payload.status !== RSVPStatus.declined &&
    payload.status !== RSVPStatus.tentative
  ) {
    return null;
  }

  const suggestedStart =
    payload.suggestedStart !== undefined
      ? Number(payload.suggestedStart)
      : undefined;
  const suggestedEnd =
    payload.suggestedEnd !== undefined
      ? Number(payload.suggestedEnd)
      : undefined;

  return {
    status: payload.status,
    suggestedStart: Number.isFinite(suggestedStart)
      ? suggestedStart
      : undefined,
    suggestedEnd: Number.isFinite(suggestedEnd) ? suggestedEnd : undefined,
    comment: payload.comment ?? "",
  };
}

function parsePrivateRSVPEvent(
  event: Event,
  viewKey: string,
): RSVPRecord | null {
  const aTag = event.tags.find((tag) => tag[0] === "a")?.[1];
  if (!aTag) return null;

  const viewPrivateKey = nip19.decode(viewKey as NSec).data;
  const payload = normalizeRsvpPayload(
    selfDecrypt<Partial<RSVPPayload>>(viewPrivateKey, event.content),
  );
  if (!payload) return null;

  return {
    pubkey: event.pubkey,
    status: payload.status,
    suggestedStart: payload.suggestedStart,
    suggestedEnd: payload.suggestedEnd,
    comment: payload.comment,
    createdAt: event.created_at,
    eventCoord: aTag,
  };
}

/**
 * Publishes an RSVP for a private calendar event.
 *
 * The RSVP is published as a private RSVP event (kind 32069) whose
 * payload is encrypted with the event's shared viewKey. Readers discover
 * it by the calendar-event "a" tag and can decrypt it only if they know
 * that viewKey.
 */
export async function publishPrivateRSVPEvent(params: {
  authorPubKey: string;
  eventId: string; // d-tag of the calendar event
  referenceKind: number; // EventKinds.PrivateCalendarEvent
  relayHint?: string;
  viewKey: string;
  payload: RSVPPayload;
}) {
  const responderPubkey = await getUserPublicKey();
  const tags: string[][] = [
    params.relayHint
      ? [
          "a",
          `${params.referenceKind}:${params.authorPubKey}:${params.eventId}`,
          params.relayHint,
        ]
      : [
          "a",
          `${params.referenceKind}:${params.authorPubKey}:${params.eventId}`,
        ],
    ["d", getRsvpDTag(responderPubkey, params.authorPubKey, params.eventId)],
  ];
  const viewPrivateKey = nip19.decode(params.viewKey as NSec).data;
  const encryptedContent = selfEncrypt(viewPrivateKey, params.payload);
  const signed = await buildAndSign({
    pubkey: responderPubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.PrivateRSVPEvent,
    content: encryptedContent,
    tags,
  });

  await publishSignedEvent(signed);
}

/**
 * Publishes a NIP-52 RSVP (kind 31925) for a public calendar event.
 * Tags carry status + suggested times; comment goes in content.
 */
export async function publishPublicRSVPEvent(params: {
  authorPubKey: string;
  eventId: string;
  relayHint?: string;
  payload: RSVPPayload;
}) {
  const responderPubkey = await getUserPublicKey();
  const tags = buildRSVPTags({
    referenceKind: EventKinds.PublicCalendarEvent,
    authorPubKey: params.authorPubKey,
    eventDTag: params.eventId,
    relayHint: params.relayHint,
    payload: params.payload,
  });
  // The d-tag for the RSVP itself: deterministic per (responder, event)
  // so a single replaceable event holds the latest status per responder.
  const rsvpDTag = getRsvpDTag(
    responderPubkey,
    params.authorPubKey,
    params.eventId,
  );
  tags.push(["d", rsvpDTag]);

  const signed = await buildAndSign({
    pubkey: responderPubkey,
    created_at: Math.floor(Date.now() / 1000),
    kind: EventKinds.PublicRSVPEvent,
    content: params.payload.comment ?? "",
    tags,
  });
  await publishSignedEvent(signed);
}

const parseRSVPTags = (
  pubkey: string,
  tags: string[][],
  content: string,
  createdAt: number,
): RSVPRecord | null => {
  const aTag = tags.find((t) => t[0] === "a")?.[1];
  if (!aTag) return null;
  const payload = normalizeRsvpPayload({
    status: tags.find((t) => t[0] === "status")?.[1] as RSVPStatus | undefined,
    suggestedStart: tags.find((t) => t[0] === "start")?.[1]
      ? Number(tags.find((t) => t[0] === "start")?.[1])
      : undefined,
    suggestedEnd: tags.find((t) => t[0] === "end")?.[1]
      ? Number(tags.find((t) => t[0] === "end")?.[1])
      : undefined,
    comment: content || "",
  });
  if (!payload) return null;

  return {
    pubkey,
    status: payload.status,
    suggestedStart: payload.suggestedStart,
    suggestedEnd: payload.suggestedEnd,
    comment: payload.comment,
    createdAt,
    eventCoord: aTag,
  };
};

/**
 * Subscribes to current private RSVP events (kind 32069) and emits parsed
 * RSVP records that match the supplied event coordinate. Use this on the
 * event detail page to aggregate participant statuses for a private calendar
 * event.
 */
export const fetchPrivateEventRSVPs = (
  params: {
    eventCoord: string;
    viewKey: string;
    relayHint?: string;
  },
  onRSVP: (record: RSVPRecord) => void,
  onEose?: () => void,
): ObserveHandle => {
  addGossipRelays([params.relayHint]);
  return dataLayer.observe(
    [
      {
        kinds: [EventKinds.PrivateRSVPEvent],
        "#a": [params.eventCoord],
      },
    ],
    {
      onEvent: (event: Event) => {
        try {
          const record = parsePrivateRSVPEvent(event, params.viewKey);
          if (!record) return;
          if (record.eventCoord !== params.eventCoord) return;
          onRSVP(record);
        } catch (error) {
          console.error("Failed to process private RSVP:", error);
        }
      },
      onEose,
    },
  );
};

/**
 * Subscribes to public NIP-52 RSVPs (kind 31925) for the given event
 * coordinate. Tags are read directly off the public event.
 */
export const fetchPublicEventRSVPs = (
  params: { eventCoord: string },
  onRSVP: (record: RSVPRecord) => void,
  onEose?: () => void,
): ObserveHandle => {
  const filter: Filter = {
    kinds: [EventKinds.PublicRSVPEvent],
    "#a": [params.eventCoord],
  };
  return dataLayer.observe([filter], {
    onEvent: (event: Event) => {
      const record = parseRSVPTags(
        event.pubkey,
        event.tags,
        event.content,
        event.created_at,
      );
      if (!record) return;
      onRSVP(record);
    },
    onEose,
  });
};
