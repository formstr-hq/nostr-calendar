/**
 * Events Store
 *
 * Manages calendar events displayed in the UI. Events come from two sources:
 * 1. Public events: fetched directly from relays (kind 31923)
 * 2. Private events: fetched via calendar list references (kind 32678/32679)
 *
 * The private event flow has been refactored from the old gift-wrap-based approach:
 * - OLD: subscribe to gift wraps → unwrap → fetch event → display
 * - NEW: read event refs from visible calendar lists → split into recurring/non-recurring
 *        → fetch events by d-tag → decrypt with viewKey from the ref → display
 *
 * Recurring events (isRecurring=true in the ref) are always fetched regardless
 * of the time range, since old recurring events may have future occurrences.
 */

import { Event } from "nostr-tools";
import { create } from "zustand";
import {
  fetchCalendarEvents,
  fetchPrivateCalendarEvents,
  viewPrivateEvent,
} from "../common/nostr";
import { isValid } from "date-fns";
import {
  appendOne,
  denormalize,
  normalize,
  removeOne,
} from "@voiceflow/normal-store";
import { nostrEventToCalendar } from "../utils/parser";
import { RSVPResponse } from "../utils/types";
import type { ICalendarEvent } from "../utils/types";
import { scheduleEventNotifications } from "../utils/notifications";
import {
  getSecureItem,
  setSecureItem,
  removeSecureItem,
} from "../common/localStorage";
import { useCalendarLists } from "./calendarLists";
import { parseEventRef } from "../utils/calendarListTypes";
import type { SubscriptionHandle } from "../common/nostrRuntime";
import { getDTag } from "../common/nostrRuntime/utils/helpers";

export const EVENTS_STORAGE_KEY = "cal:events";

const saveEventsToStorage = (events: ICalendarEvent[]) => {
  setSecureItem(EVENTS_STORAGE_KEY, events);
};

let publicSubscription: SubscriptionHandle | undefined;
let privateSubscription: SubscriptionHandle | undefined;

export { ICalendarEvent, RSVPResponse };

interface TimeRangeConfig {
  daysBefore: number;
  daysAfter: number;
}

// Updated time range: -14 days / +28 days per requirements
export const getTimeRangeConfig = (): TimeRangeConfig => ({
  daysBefore: 14,
  daysAfter: 28,
});

// Helper function to get configurable time range
const getTimeRange = (customConfig?: {
  daysBefore?: number;
  daysAfter?: number;
}) => {
  const config = { ...getTimeRangeConfig(), ...customConfig };
  const now = new Date();

  const daysBefore = new Date(now);
  daysBefore.setDate(now.getDate() - config.daysBefore);

  const daysAfter = new Date(now);
  daysAfter.setDate(now.getDate() + config.daysAfter);

  return {
    since: Math.floor(daysBefore.getTime() / 1000),
    until: Math.floor(daysAfter.getTime() / 1000),
    daysBefore: config.daysBefore,
    daysAfter: config.daysAfter,
  };
};

/**
 * Processes a decrypted private event and adds it to the store.
 * Handles deduplication by keeping the newer version if the event already exists.
 */
const processPrivateEvent = (
  event: Event,
  _timeRange: ReturnType<typeof getTimeRange>,
  viewKey?: string,
  calendarId?: string,
) => {
  const { events } = useTimeBasedEvents.getState();
  let store = normalize(events);
  const parsedEvent = nostrEventToCalendar(event, {
    viewKey,
    isPrivateEvent: true,
  });

  // Attach the calendar ID so events can be themed by calendar color
  if (calendarId) {
    parsedEvent.calendarId = calendarId;
  }

  // Check if we have valid begin/end times after processing all tags
  if (parsedEvent.begin === 0 || parsedEvent.end === 0) {
    return;
  }

  if (
    !isValid(new Date(parsedEvent.begin)) ||
    !isValid(new Date(parsedEvent.end))
  ) {
    console.warn("invalid date", parsedEvent, event);
  } else {
    if (store.allKeys.includes(parsedEvent.id)) {
      const previousEvent = store.byKey[parsedEvent.id];
      if (parsedEvent.createdAt > previousEvent.createdAt) {
        store = removeOne(store, parsedEvent.id);
        store = appendOne(store, parsedEvent.id, parsedEvent);
      }
    } else {
      store = appendOne(store, parsedEvent.id, parsedEvent);
    }
  }
  scheduleEventNotifications(parsedEvent);
  const updatedEvents = denormalize(store);
  saveEventsToStorage(updatedEvents);
  useTimeBasedEvents.setState({
    eventById: store.byKey,
    events: updatedEvents,
  });
};

/**
 * Tracks which event IDs have already been fetched to avoid duplicate requests.
 */
const processedEventIds = new Set<string>();

export const useTimeBasedEvents = create<{
  events: ICalendarEvent[];
  eventById: Record<string, ICalendarEvent>;
  isCacheLoaded: boolean;
  loadCachedEvents: () => Promise<void>;
  clearCachedEvents: () => Promise<void>;
  fetchEvents: (customTimeRange?: {
    daysBefore?: number;
    daysAfter?: number;
  }) => void;
  fetchPrivateEvents: (customTimeRange?: {
    daysBefore?: number;
    daysAfter?: number;
  }) => void;
  updateEvent: (event: ICalendarEvent) => void;
  removeEvent: (eventId: string) => void;
  resetPrivateEvents: () => void;
  getTimeRangeConfig: () => { daysBefore: number; daysAfter: number };
  updateTimeRangeConfig: (config: {
    daysBefore?: number;
    daysAfter?: number;
  }) => void;
}>((set) => ({
  updateEvent: (updatedEvent) => {
    set(({ events }) => {
      let store = normalize(events);
      if (store.allKeys.includes(updatedEvent.id)) {
        store = removeOne(store, updatedEvent.id);
      }
      store = appendOne(store, updatedEvent.id, updatedEvent);
      const updatedEvents = denormalize(store);
      saveEventsToStorage(updatedEvents);
      return {
        eventById: store.byKey,
        events: updatedEvents,
      };
    });
  },
  removeEvent: (eventId) => {
    set(({ events }) => {
      let store = normalize(events);
      if (store.allKeys.includes(eventId)) {
        store = removeOne(store, eventId);
      }
      const updatedEvents = denormalize(store);
      saveEventsToStorage(updatedEvents);
      return {
        eventById: store.byKey,
        events: updatedEvents,
      };
    });
  },
  resetPrivateEvents: () => {
    set(({ events }) => {
      const publicEvents = events.filter((evt) => !evt.isPrivateEvent);
      return {
        events: publicEvents,
      };
    });
  },
  events: [],
  eventById: {},
  isCacheLoaded: false,
  loadCachedEvents: async () => {
    const cached = await getSecureItem<ICalendarEvent[]>(
      EVENTS_STORAGE_KEY,
      [],
    );
    if (cached.length > 0) {
      set({
        events: cached,
        eventById: Object.fromEntries(cached.map((e) => [e.id, e])),
        isCacheLoaded: true,
      });
    } else {
      set({ isCacheLoaded: true });
    }
  },
  clearCachedEvents: async () => {
    await removeSecureItem(EVENTS_STORAGE_KEY);
    set({ events: [], eventById: {} });
  },
  getTimeRangeConfig,
  updateTimeRangeConfig: (newConfig) => {
    Object.assign(getTimeRangeConfig(), newConfig);
  },

  /**
   * Fetches private events from calendar list references.
   *
   * Instead of subscribing to gift wraps, this reads event refs from
   * visible calendar lists and fetches each event by its d-tag.
   *
   * Event refs are split into two groups:
   * - Non-recurring: filtered by time range (-14/+28 days)
   * - Recurring (isRecurring=true): always fetched regardless of time range,
   *   because old recurring events may have occurrences in the current window
   */
  fetchPrivateEvents(customTimeRange) {
    if (privateSubscription) {
      privateSubscription.unsubscribe();
      privateSubscription = undefined;
    }

    const timeRange = getTimeRange(customTimeRange);
    const visibleRefs = useCalendarLists.getState().getVisibleEventRefs();

    if (visibleRefs.length === 0) return;

    // Get calendar ID for each ref so events can be colored by their calendar
    // Key by coordinate (first element of ref array) since it uniquely identifies the event
    const calendars = useCalendarLists
      .getState()
      .calendars.filter((c) => c.isVisible);
    const refToCalendarId = new Map<string, string>();
    for (const cal of calendars) {
      for (const ref of cal.eventRefs) {
        refToCalendarId.set(ref[0], cal.id);
      }
    }

    // Parse refs and split into recurring vs non-recurring
    const eventIdsToFetch: string[] = [];
    const kinds = new Set<number>();
    const authorPubkeys = new Set<string>();
    const viewKeyMap = new Map<
      string,
      { viewKey: string; calendarId: string }
    >();

    for (const ref of visibleRefs) {
      const parsed = parseEventRef(ref);

      // Skip already-processed events
      if (processedEventIds.has(parsed.eventDTag)) continue;

      eventIdsToFetch.push(parsed.eventDTag);
      authorPubkeys.add(parsed.authorPubkey);
      kinds.add(parsed.kind);
      viewKeyMap.set(parsed.eventDTag, {
        viewKey: parsed.viewKey,
        calendarId: refToCalendarId.get(ref[0]) || "",
      });
    }

    if (eventIdsToFetch.length === 0) return;

    // Fetch all matching events in a single subscription
    privateSubscription = fetchPrivateCalendarEvents(
      {
        eventIds: eventIdsToFetch,
        authors: Array.from(authorPubkeys),
        kinds: Array.from(kinds),
      },
      (event) => {
        const dTag = getDTag(event);
        if (!dTag) {
          return;
        }
        const meta = dTag ? viewKeyMap.get(dTag) : undefined;
        if (meta) {
          const decrypted = viewPrivateEvent(event, meta.viewKey);
          processPrivateEvent(
            decrypted,
            timeRange,
            meta.viewKey,
            meta.calendarId,
          );
          processedEventIds.add(dTag);
        }
      },
    );
  },

  /**
   * Fetches public calendar events from relays via nostrRuntime.
   */
  fetchEvents: (customTimeRange) => {
    if (publicSubscription) {
      return;
    }

    const timeRange = getTimeRange(customTimeRange);

    publicSubscription = fetchCalendarEvents(
      {
        since: timeRange.since,
        until: timeRange.until,
      },
      (event: Event) => {
        set(({ events, eventById }) => {
          let store = normalize(events);
          const parsedEvent = nostrEventToCalendar(event);

          // Check if we have valid begin/end times after processing all tags
          if (parsedEvent.begin === 0 || parsedEvent.end === 0) {
            return { events, eventById }; // Skip this event
          }

          // Client-side filter for events within time range (backup check)
          const eventStart = parsedEvent.begin / 1000;
          const eventEnd = parsedEvent.end / 1000;

          if (eventEnd < timeRange.since || eventStart > timeRange.until) {
            return { events, eventById }; // Skip this event
          }

          if (
            !isValid(new Date(parsedEvent.begin)) ||
            !isValid(new Date(parsedEvent.end))
          ) {
            return { events, eventById };
          }
          if (store.allKeys.includes(parsedEvent.id)) {
            const previousEvent = store.byKey[parsedEvent.id];
            if (parsedEvent.createdAt > previousEvent.createdAt) {
              store = removeOne(store, parsedEvent.id);
              store = appendOne(store, parsedEvent.id, parsedEvent);
            }
          } else {
            store = appendOne(store, parsedEvent.id, parsedEvent);
          }
          scheduleEventNotifications(parsedEvent);
          const updatedEvents = denormalize(store);
          saveEventsToStorage(updatedEvents);
          return {
            eventById: store.byKey,
            events: updatedEvents,
          };
        });
      },
    );
  },
}));
