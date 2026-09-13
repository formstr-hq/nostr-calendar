import { RSVPStatus, type ICalendarEvent } from "../../../utils/types";

/** Reverse the event's guest mapping: guestPubkey → email. */
export function guestEmailByPubkey(
  event: ICalendarEvent,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [email, pubkey] of Object.entries(event.guestPubkeys ?? {})) {
    map[pubkey.toLowerCase()] = email;
  }
  return map;
}

/** i18n id for a guest's RSVP status label (falls back to the "via email" tag). */
export function guestRsvpLabelId(status: RSVPStatus): string {
  switch (status) {
    case RSVPStatus.accepted:
      return "rsvp.yes";
    case RSVPStatus.declined:
      return "rsvp.no";
    case RSVPStatus.tentative:
      return "rsvp.maybe";
    default:
      return "emailGuest.viaEmail";
  }
}
