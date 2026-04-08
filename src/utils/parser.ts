import { Event } from "nostr-tools";
import type { ICalendarEvent } from "./types";
import { normalizeRRule } from "./repeatingEventsHelper";

export const nostrEventToCalendar = (
  event: Event,
  {
    viewKey,
    isPrivateEvent,
  }: { viewKey?: string; isPrivateEvent?: boolean } = {},
): ICalendarEvent => {
  const parsedEvent: ICalendarEvent = {
    description: event.content,
    user: event.pubkey,
    begin: 0,
    end: 0,
    eventId: event.id,
    kind: event.kind,
    id: "",
    title: "",
    createdAt: event.created_at,
    categories: [],
    reference: [],
    website: "",
    location: [],
    geoHash: [],
    participants: [],
    viewKey: viewKey,
    isPrivateEvent: !!isPrivateEvent,
    repeat: {
      rrules: [],
    },
    rsvpResponses: [],
  };
  const recurrenceRules: string[] = [];

  event.tags.forEach(([key, value, labelNamespace], index) => {
    switch (key) {
      case "description":
        parsedEvent.description = value;
        break;
      case "start":
        parsedEvent.begin = Number(value) * 1000;
        break;
      case "end":
        parsedEvent.end = Number(value) * 1000;
        break;
      case "d":
        parsedEvent.id = value;
        break;
      case "title":
      case "name":
        parsedEvent.title = value;
        break;
      case "r":
        parsedEvent.reference.push(value);
        break;
      case "image":
        parsedEvent.image = value;
        break;
      case "t":
        parsedEvent.categories.push(value);
        break;
      case "location":
        parsedEvent.location.push(value);
        break;
      case "p":
        parsedEvent.participants.push(value);
        break;
      case "g":
        parsedEvent.geoHash.push(value);
        break;
      case "l": {
        const previousTag = event.tags[index - 1];
        const followsRRuleLabel =
          previousTag?.[0] === "L" && previousTag?.[1] === "rrule";
        const isRRuleLabel =
          labelNamespace === "rrule" || followsRRuleLabel;

        if (!isRRuleLabel || !value) {
          break;
        }

        const normalizedRule = normalizeRRule(value);
        if (normalizedRule && !recurrenceRules.includes(normalizedRule)) {
          recurrenceRules.push(normalizedRule);
        }

        break;
      }
    }
  });

  parsedEvent.repeat = {
    rrules: recurrenceRules,
  };

  return parsedEvent;
};
