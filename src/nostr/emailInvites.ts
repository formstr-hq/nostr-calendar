import { Event, UnsignedEvent } from "nostr-tools";
import { getConversationKey, encrypt } from "nostr-tools/nip44";
import {
  generateSecretKey,
  getPublicKey,
  getEventHash,
  finalizeEvent,
} from "nostr-tools/pure";
import { signerManager } from "../common/signer";
import { buildPrivateCalendarEventUrl } from "./events";
import { fetchRelayLists } from "./relays";
import { withGuestFragment } from "../utils/emailGuestLink";
import {
  isEmailAddress,
  qualifyMailAddress,
  resolveMailBridgePubkey,
  senderOwnsFromAddress,
  splitMailAddress,
} from "./mailBridge";
import { useUser } from "../stores/user";
import type { ICalendarEvent } from "../utils/types";
import type { ActiveSigner } from "@formstr/signer";
import { createLogger } from "../utils/logger";

const logger = createLogger("EMAIL_INVITES");

/**
 * Email-guest invitations.
 *
 * An email guest is invited by mail, not by gift-wrap. The app wraps an
 * RFC 2822 invite in the mailstr wire format (kind-1301 rumor, kind-13 seal
 * signed by the organizer, kind-1059 gift wrap) addressed to the bridge
 * pubkey, with the guest addresses as `deliver` tags. The bridge authorizes
 * on the seal's pubkey and injects the message into SMTP.
 *
 * Wire shape mirrors the sister `nail` repo's shared protocol module
 * (docs/ARCHITECTURE.md §4-§5), including the "content is a byte string"
 * rule: rumor content is the RFC 2822 message as one code unit per octet.
 */

export const KIND_MAIL = 1301;
export const KIND_SEAL = 13;
export const KIND_GIFTWRAP = 1059;

type Rumor = UnsignedEvent & { id: string };

const TWO_DAYS = 2 * 24 * 60 * 60;

/** NIP-59: outer timestamps are randomized into the past to thwart time analysis. */
function randomPast(now: number): number {
  return now - Math.floor(Math.random() * TWO_DAYS);
}

/** Each octet becomes one code unit (0-255): the "byte string" representation. */
function bytesToMessageString(bytes: Uint8Array): string {
  let result = "";
  const chunk = 0x2000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    result += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return result;
}

const CHARSET = "UTF-8";
const ENCODER = new TextEncoder();

function formatAddress(address: string): string {
  return address;
}

/**
 * Build the RFC 2822 invite body. `Content-Type: text/plain; charset=UTF-8`
 * so the byte string round-trips: we compose UTF-8, encode to bytes, and let
 * the bridge inject the exact octets.
 */
export function buildEmailInviteRfc2822({
  from,
  to,
  subject,
  body,
}: {
  from: string;
  to: string[];
  subject: string;
  body: string;
}): string {
  const messageId = `<${crypto.randomUUID()}@${splitMailAddress(from)?.domain ?? "calendar"}>`;
  const lines: string[] = [
    `Message-ID: ${messageId}`,
    `Date: ${new Date().toUTCString()}`,
    `From: ${formatAddress(from)}`,
    `To: ${to.map(formatAddress).join(", ")}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: text/plain; charset=${CHARSET}`,
    "",
    body,
  ];
  return lines.join("\r\n");
}

/**
 * Canonical URL a guest should open for this event. Private events carry the
 * viewKey query (so the guest can decrypt); the caller appends an `#nkeys1…`
 * fragment per guest that also grants them an RSVP identity.
 */
export function buildEventInviteUrl(event: ICalendarEvent): string {
  if (event.isPrivateEvent && event.viewKey) {
    return buildPrivateCalendarEventUrl({
      kind: event.kind,
      pubkey: event.user,
      dTag: event.id,
      viewKey: event.viewKey,
      relayHint: event.relayHint ?? "",
    });
  }
  return event.id
    ? `${window.location.origin}/event/${event.eventId || event.id}`
    : window.location.origin;
}

export function buildEmailInviteBody({
  hostName,
  event,
  inviteUrl,
}: {
  hostName: string;
  event: ICalendarEvent;
  inviteUrl: string;
}): string {
  const when = new Date(event.begin).toLocaleString();
  return [
    `${hostName} has invited you to an event.`,
    "",
    `Title: ${event.title}`,
    `When: ${when}`,
    event.location.length ? `Where: ${event.location.join(", ")}` : null,
    event.description ? `Notes: ${event.description}` : null,
    "",
    `View details and RSVP: ${inviteUrl}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\r\n");
}

/**
 * Wrap an already-composed mail rumor for the bridge. Deliberately mirrors
 * `sealAndWrap` from the nail protocol module: the seal is signed by the
 * organizer's real signer, and the outer wrap is signed with a throwaway key.
 */
export async function sealAndWrapForBridge(
  rumor: Rumor,
  bridgePubkey: string,
  signer: ActiveSigner,
): Promise<Event> {
  const now = Math.floor(Date.now() / 1000);
  if (!signer.nip44Encrypt) throw new Error("CANNOT_ENCRYPT");

  const seal = await signer.signEvent({
    kind: KIND_SEAL,
    pubkey: await signer.getPublicKey(),
    created_at: randomPast(now),
    tags: [],
    content: await signer.nip44Encrypt(bridgePubkey, JSON.stringify(rumor)),
  } as unknown as UnsignedEvent);

  const ephemeralSk = generateSecretKey();
  const wrap: Event = finalizeEvent(
    {
      kind: KIND_GIFTWRAP,
      created_at: randomPast(now),
      tags: [
        ["p", bridgePubkey],
        ["k", String(rumor.kind)],
      ],
      content: encrypt(
        JSON.stringify(seal),
        getConversationKey(ephemeralSk, bridgePubkey),
      ),
    },
    ephemeralSk,
  );
  return { ...wrap, id: wrap.id, pubkey: getPublicKey(ephemeralSk) };
}

export interface EmailInviteParams {
  event: ICalendarEvent;
  /** Registered From address the organizer owns (NIP-05 verified). */
  fromAddress: string;
  /** Guests to invite by email. */
  recipients: string[];
  /**
   * Per-guest `nkeys1…` fragment (carrying their one-time RSVP nsec) keyed by
   * lowercased email. When present for a guest, that guest gets their own
   * message with their own link — the fragment cannot be shared across
   * recipients, since each grants a distinct signing identity.
   */
  guestFragments?: Record<string, string>;
  /** Optional Settings override for bridge discovery. */
  bridgeOverride?: string;
}

export interface EmailInviteResult {
  /** One wrap per distinct recipient body; often just one. */
  wraps: Event[];
  bridgePubkey: string | null;
  errors: string[];
}

/**
 * Build the bridge gift wrap(s) that invite email guests.
 *
 * A guest who has a one-time RSVP key needs a link only they may use, so they
 * get an individual message (one `deliver` tag, one unique body). Guests
 * without such a key share a single wrap carrying every address as `deliver`
 * tags — one wrap, N envelope recipients. Returns `errors` rather than
 * throwing so the caller can surface a clear message and skip the step.
 */
export async function buildEmailInviteWraps({
  event,
  fromAddress,
  recipients,
  guestFragments = {},
  bridgeOverride,
}: EmailInviteParams): Promise<EmailInviteResult> {
  const uniqueRecipients = Array.from(
    new Set(
      recipients.map((r) => r.trim().toLowerCase()).filter(isEmailAddress),
    ),
  );
  if (uniqueRecipients.length === 0) {
    return { wraps: [], bridgePubkey: null, errors: [] };
  }

  // The UI holds raw From input (a bare localpart is allowed while typing);
  // qualify it into a full address at this boundary.
  const from = qualifyMailAddress(fromAddress);
  const parts = splitMailAddress(from);
  if (!parts) {
    return {
      wraps: [],
      bridgePubkey: null,
      errors: [`"${fromAddress}" is not a valid email address.`],
    };
  }

  const senderPubkey = await getSenderPubkey();
  if (!(await senderOwnsFromAddress(from, senderPubkey))) {
    return {
      wraps: [],
      bridgePubkey: null,
      errors: [
        `You do not own "${from}", so it cannot be used to send email invites.`,
      ],
    };
  }

  const bridgePubkey = await resolveMailBridgePubkey(
    parts.domain,
    bridgeOverride,
  );
  if (!bridgePubkey) {
    return {
      wraps: [],
      bridgePubkey: null,
      errors: [
        `No mail bridge is configured for "${parts.domain}", so email guests cannot be invited.`,
      ],
    };
  }

  // Warm the worker's outbox cache with the bridge's relay list so the
  // p-tagged wrap routes to the bridge's own inbox relays, not just ours.
  // Mirrors the gift-wrap invite path (see events.ts).
  await fetchRelayLists([bridgePubkey]);

  const signer = await signerManager.getSigner();
  const senderName = await resolveSenderName();
  const inviteUrl = buildEventInviteUrl(event);

  // Group into: (a) guests with a unique link, each their own wrap, and
  // (b) everyone else, sharing one wrap.
  const individualized = uniqueRecipients.filter((email) =>
    Boolean(guestFragments[email]),
  );
  const shared = uniqueRecipients.filter((email) => !guestFragments[email]);

  const buildWrap = async (
    addresses: string[],
    body: string,
  ): Promise<Event> => {
    const rfc2822 = buildEmailInviteRfc2822({
      from,
      to: addresses,
      subject: `Invitation: ${event.title}`,
      body,
    });
    const content = bytesToMessageString(ENCODER.encode(rfc2822));
    const rumor = {
      kind: KIND_MAIL,
      pubkey: senderPubkey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ["p", bridgePubkey],
        ...addresses.map((address) => ["deliver", address]),
      ],
      content,
    };
    const rumorWithId: Rumor = { ...rumor, id: getEventHash(rumor) };
    return sealAndWrapForBridge(rumorWithId, bridgePubkey, signer);
  };

  try {
    const wraps: Event[] = [];
    for (const email of individualized) {
      const guestUrl = withGuestFragment(inviteUrl, guestFragments[email]);
      wraps.push(
        await buildWrap(
          [email],
          buildEmailInviteBody({
            hostName: senderName,
            event,
            inviteUrl: guestUrl,
          }),
        ),
      );
    }
    if (shared.length > 0) {
      wraps.push(
        await buildWrap(
          shared,
          buildEmailInviteBody({ hostName: senderName, event, inviteUrl }),
        ),
      );
    }
    return { wraps, bridgePubkey, errors: [] };
  } catch (error) {
    logger.error("Failed to build email invite wrap", error);
    return {
      wraps: [],
      bridgePubkey,
      errors: ["Could not encrypt the email invite."],
    };
  }
}

async function getSenderPubkey(): Promise<string> {
  const signer = await signerManager.getSigner();
  return signer.getPublicKey();
}

async function resolveSenderName(): Promise<string> {
  const user = useUser.getState().user;
  if (user?.name) return user.name;
  if (user?.pubkey) return `${user.pubkey.slice(0, 8)}…`;
  return "A calendar host";
}

// Re-exported for tests / callers that need the low-level pieces.
export { encrypt, getConversationKey };
export type { Rumor };
