import { Event } from "nostr-tools";
import type {
  ICalendarEvent,
  ISchedulingPage,
  IAvailabilityWindow,
  DurationMode,
} from "./types";
import { getRelays } from "../common/nostr";

export const nostrEventToCalendar = (
  event: Event,
  {
    viewKey,
    isPrivateEvent,
    relayHint,
  }: { viewKey?: string; isPrivateEvent?: boolean; relayHint?: string } = {},
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
    relayHint: relayHint,
    repeat: {
      rrule: null,
    },
    rsvpResponses: [],
  };
  event.tags.forEach(([key, value], index) => {
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
      case "notification":
        if (value === "enabled" || value === "disabled") {
          parsedEvent.notificationPreference = value;
        }
        break;
      case "L":
        switch (value) {
          case "rrule":
            parsedEvent.repeat = {
              rrule: event.tags[index + 1]?.[1] || null,
            };
            break;
        }
        break;
    }
  });
  return parsedEvent;
};

/**
 * Parse a Nostr event (kind 31927) into an ISchedulingPage.
 */
export const nostrEventToSchedulingPage = (event: Event): ISchedulingPage => {
  const page: ISchedulingPage = {
    id: "",
    eventId: event.id,
    user: event.pubkey,
    title: "",
    description: event.content,
    slotDurations: [],
    durationMode: "fixed",
    availabilityWindows: [],
    blockedDates: [],
    timezone: "UTC",
    minNotice: 3600,
    maxAdvance: 2592000,
    buffer: 900,
    expiry: 172800,
    location: "",
    image: undefined,
    relayHints: [],
    createdAt: event.created_at,
  };

  event.tags.forEach(([key, ...values]) => {
    switch (key) {
      case "d":
        page.id = values[0];
        break;
      case "title":
        page.title = values[0];
        break;
      case "slot_duration":
        page.slotDurations.push(Number(values[0]));
        break;
      case "duration_mode":
        page.durationMode = values[0] as DurationMode;
        break;
      case "avail": {
        const window: IAvailabilityWindow = {
          type: values[0] as "recurring" | "date",
          startTime: "",
          endTime: "",
        };
        if (values[0] === "recurring") {
          window.dayOfWeek = Number(values[1]);
          window.startTime = values[2];
          window.endTime = values[3];
        } else if (values[0] === "date") {
          window.date = values[1];
          window.startTime = values[2];
          window.endTime = values[3];
        }
        page.availabilityWindows.push(window);
        break;
      }
      case "blocked":
        page.blockedDates.push(values[0]);
        break;
      case "timezone":
        page.timezone = values[0];
        break;
      case "min_notice":
        page.minNotice = Number(values[0]);
        break;
      case "max_advance":
        page.maxAdvance = Number(values[0]);
        break;
      case "buffer":
        page.buffer = Number(values[0]);
        break;
      case "expiry":
        page.expiry = Number(values[0]);
        break;
      case "location":
        page.location = values[0];
        break;
      case "image":
        page.image = values[0];
        break;
      case "event_title":
        page.eventTitle = values[0];
        break;
      case "relay":
        page.relayHints!.push(values[0]);
        break;
    }
  });

  return page;
};

/**
 * Serialize an ISchedulingPage into Nostr tags for publishing.
 */
export const schedulingPageToTags = (page: ISchedulingPage): string[][] => {
  const tags: string[][] = [
    ["d", page.id],
    ["title", page.title],
    ["duration_mode", page.durationMode],
    ["timezone", page.timezone],
    ["min_notice", String(page.minNotice)],
    ["max_advance", String(page.maxAdvance)],
    ["buffer", String(page.buffer)],
    ["expiry", String(page.expiry)],
  ];

  for (const duration of page.slotDurations) {
    tags.push(["slot_duration", String(duration)]);
  }

  for (const window of page.availabilityWindows) {
    if (window.type === "recurring") {
      tags.push([
        "avail",
        "recurring",
        String(window.dayOfWeek),
        window.startTime,
        window.endTime,
      ]);
    } else if (window.type === "date") {
      tags.push([
        "avail",
        "date",
        window.date!,
        window.startTime,
        window.endTime,
      ]);
    }
  }

  for (const date of page.blockedDates) {
    tags.push(["blocked", date]);
  }

  if (page.location) {
    tags.push(["location", page.location]);
  }

  if (page.image) {
    tags.push(["image", page.image]);
  }

  if (page.eventTitle) {
    tags.push(["event_title", page.eventTitle]);
  }

  // Add relay hints so consumers know where to find this event
  // and where to publish booking requests
  for (const relay of getRelays()) {
    tags.push(["relay", relay]);
  }

  return tags;
};
