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
} from "../nostr/events";
import { isValid } from "date-fns";
import {
  appendOne,
  denormalize,
  normalize,
  removeOne,
} from "@voiceflow/normal-store";
import { getDTag, nostrEventToCalendar } from "../utils/parser";
import type { ICalendarEvent } from "../utils/types";
import {
  scheduleEventNotifications,
  cancelEventNotifications,
} from "../utils/notifications";
import { useNotifications } from "./notifications";
import { clearNotificationPreference } from "../utils/notificationPreferences";
import {
  getSecureItem,
  setSecureItem,
  removeSecureItem,
} from "../common/localStorage";
import { useCalendarLists } from "./calendarLists";
import {
  findCalendarForEvent,
  getCalendarEventCoordinate,
  parseEventRef,
} from "../utils/calendarListTypes";
import type { ObserveHandle } from "@formstr/local-relay";
import { shouldScheduleNotifications } from "../utils/notificationPreferences";
import { reconcileNotificationSchedule } from "../plugins/notificationScheduler";

export const EVENTS_STORAGE_KEY = "cal:events";

const saveEventsToStorage = async (events: ICalendarEvent[]) => {
  await setSecureItem(EVENTS_STORAGE_KEY, events);
  await reconcileNotificationSchedule();
};

const getCalendarNotificationPreference = (
  event: ICalendarEvent,
): "enabled" | "disabled" | undefined => {
  const calendar = findCalendarForEvent(
    useCalendarLists.getState().calendars,
    event,
  );
  return calendar?.notificationPreference;
};

const syncEventNotifications = async (
  event: ICalendarEvent,
  { cancelExisting = false }: { cancelExisting?: boolean } = {},
): Promise<void> => {
  const calendarPreference = getCalendarNotificationPreference(event);
  const shouldSchedule = shouldScheduleNotifications(
    event.notificationPreference,
    calendarPreference,
  );

  try {
    if (!shouldSchedule) {
      await cancelEventNotifications(event.id);
      useNotifications.getState().removeNotifications(event.id);
      return;
    }

    if (cancelExisting) {
      await cancelEventNotifications(event.id);
      useNotifications.getState().removeNotifications(event.id);
    }

    const notifications = await scheduleEventNotifications(event);
    useNotifications.getState().setNotifications(event.id, notifications);
  } catch (error) {
    console.warn("Failed to sync event notifications", error);
  }
};

let publicSubscription: ObserveHandle | undefined;

export { ICalendarEvent };

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
  relayHint?: string,
) => {
  const { events } = useTimeBasedEvents.getState();
  let store = normalize(events);
  const parsedEvent = nostrEventToCalendar(event, calendarId ?? "", {
    viewKey,
    isPrivateEvent: true,
    relayHint,
  });

  // Check if we have valid begin/end times after processing all tags
  if (parsedEvent.begin === 0 || parsedEvent.end === 0) {
    return;
  }

  // The private-events observe re-emits the same cached event on every cache
  // replay (re-subscribe, worker restart), so only touch state when this is a
  // genuinely new or newer version — otherwise we'd re-schedule notifications
  // and rewrite storage on every replay.
  let changed = false;
  if (
    !isValid(new Date(parsedEvent.begin)) ||
    !isValid(new Date(parsedEvent.end))
  ) {
    console.warn("invalid date", parsedEvent, event);
  } else if (store.allKeys.includes(parsedEvent.id)) {
    const previousEvent = store.byKey[parsedEvent.id];
    if (parsedEvent.createdAt > previousEvent.createdAt) {
      store = removeOne(store, parsedEvent.id);
      store = appendOne(store, parsedEvent.id, parsedEvent);
      changed = true;
    }
  } else {
    store = appendOne(store, parsedEvent.id, parsedEvent);
    changed = true;
  }
  if (!changed) return;

  void syncEventNotifications(parsedEvent);
  const updatedEvents = denormalize(store);
  saveEventsToStorage(updatedEvents);
  useTimeBasedEvents.setState({
    eventById: store.byKey,
    events: updatedEvents,
  });
};

// The single standing interest in the user's private calendar events, keyed by
// the set of visible event refs. Re-declared (never leaked) whenever that set
// changes, so removing an event from a calendar drops it from the interest and
// a later cache replay can't resurrect it.
let privateSubscription: ObserveHandle | undefined;
let privateSubKey = "";

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
  addEvent: (event: ICalendarEvent) => void;
  updateEvent: (event: ICalendarEvent) => void;
  removeEvent: (id: string) => void;
  resetPrivateEvents: () => void;
  getTimeRangeConfig: () => { daysBefore: number; daysAfter: number };
  updateTimeRangeConfig: (config: {
    daysBefore?: number;
    daysAfter?: number;
  }) => void;
  refreshNotificationPreferencesForCalendar: (calendarId: string) => void;
}>((set) => ({
  addEvent: (newEvent) => {
    set(({ events }) => {
      const store = normalize(events);
      if (store.allKeys.includes(newEvent.id))
        return { events, eventById: store.byKey };
      const updated = appendOne(store, newEvent.id, newEvent);
      const updatedEvents = denormalize(updated);
      saveEventsToStorage(updatedEvents);
      return { eventById: updated.byKey, events: updatedEvents };
    });
    void syncEventNotifications(newEvent);
  },
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
    void syncEventNotifications(updatedEvent, { cancelExisting: true });
  },
  removeEvent: (id) => {
    set(({ events }) => {
      let store = normalize(events);
      if (store.allKeys.includes(id)) {
        store = removeOne(store, id);
      }
      const updatedEvents = denormalize(store);
      saveEventsToStorage(updatedEvents);
      return {
        eventById: store.byKey,
        events: updatedEvents,
      };
    });
    void cancelEventNotifications(id);
    useNotifications.getState().removeNotifications(id);
    void clearNotificationPreference(id);
  },
  resetPrivateEvents: () => {
    privateSubscription?.unobserve();
    privateSubscription = undefined;
    privateSubKey = "";
    set(({ events }) => {
      const publicEvents = events.filter((evt) => !evt.isPrivateEvent);
      saveEventsToStorage([]);
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
    // Drop the standing interests — the relay worker is restarted on logout,
    // so stale handles would block the re-subscribe guards after re-login.
    publicSubscription?.unobserve();
    publicSubscription = undefined;
    privateSubscription?.unobserve();
    privateSubscription = undefined;
    privateSubKey = "";
    await removeSecureItem(EVENTS_STORAGE_KEY);
    set({ events: [], eventById: {} });
  },
  getTimeRangeConfig,
  updateTimeRangeConfig: (newConfig) => {
    Object.assign(getTimeRangeConfig(), newConfig);
  },
  refreshNotificationPreferencesForCalendar: (calendarId) => {
    const { events } = useTimeBasedEvents.getState();
    const calendar = useCalendarLists
      .getState()
      .calendars.find((cal) => cal.id === calendarId);
    if (!calendar) return;

    const calendarCoordinates = new Set(
      calendar.eventRefs.map((ref) => ref[0]),
    );
    const relevantEvents = events.filter((event) =>
      calendarCoordinates.has(getCalendarEventCoordinate(event)),
    );

    void (async () => {
      const batchSize = 5;
      for (let i = 0; i < relevantEvents.length; i += batchSize) {
        const batch = relevantEvents.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map((event) =>
            syncEventNotifications(event, { cancelExisting: true }),
          ),
        );
      }
    })();
  },

  /**
   * Declares a single standing interest in the user's private calendar events,
   * derived from the event refs of every visible calendar list. The relay
   * worker serves them from cache and keeps them warm; the interest is keyed by
   * the visible set, so removing an event from a calendar drops its d-tag from
   * the filter and the worker stops delivering it — a later cache replay can
   * never resurrect it.
   */
  fetchPrivateEvents(customTimeRange) {
    const timeRange = getTimeRange(customTimeRange);
    const visibleCalendars = useCalendarLists
      .getState()
      .calendars.filter((c) => c.isVisible);
    const visibleRefs = visibleCalendars.flatMap((c) => c.eventRefs);

    if (visibleRefs.length === 0) {
      privateSubscription?.unobserve();
      privateSubscription = undefined;
      privateSubKey = "";
      return;
    }

    // Map ref coordinate (ref[0]) → calendarId
    const refToCalendarId = new Map<string, string>();
    for (const cal of visibleCalendars) {
      for (const ref of cal.eventRefs) {
        refToCalendarId.set(ref[0], cal.id);
      }
    }

    const eventIds: string[] = [];
    const kinds = new Set<number>();
    const authorPubkeys = new Set<string>();
    const hintRelays = new Set<string>();
    const viewKeyMap = new Map<
      string,
      { viewKey: string; calendarId: string; relayUrl: string }
    >();

    for (const ref of visibleRefs) {
      const parsed = parseEventRef(ref);
      eventIds.push(parsed.eventDTag);
      authorPubkeys.add(parsed.authorPubkey);
      kinds.add(parsed.kind);
      if (parsed.relayUrl) hintRelays.add(parsed.relayUrl);
      viewKeyMap.set(parsed.eventDTag, {
        viewKey: parsed.viewKey || "",
        calendarId: refToCalendarId.get(ref[0]) || "",
        relayUrl: parsed.relayUrl,
      });
    }

    // Only re-declare when the visible set actually changed — this method is
    // called on every calendars/visibility change.
    const key = eventIds.slice().sort().join(",");
    if (key === privateSubKey && privateSubscription) return;
    privateSubscription?.unobserve();
    privateSubKey = key;

    privateSubscription = fetchPrivateCalendarEvents(
      {
        eventIds,
        authors: Array.from(authorPubkeys),
        kinds: Array.from(kinds),
        relays: hintRelays.size > 0 ? Array.from(hintRelays) : undefined,
      },
      (event) => {
        const dTag = getDTag(event);
        const meta = dTag ? viewKeyMap.get(dTag) : undefined;
        if (!meta || !meta.viewKey) return;
        const decrypted = viewPrivateEvent(event, meta.viewKey);
        if (decrypted) {
          processPrivateEvent(
            decrypted,
            timeRange,
            meta.viewKey,
            meta.calendarId,
            meta.relayUrl,
          );
        }
      },
    );
  },

  /**
   * Observes public calendar events through the local relay.
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
          const parsedEvent = nostrEventToCalendar(event, "");

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
          void syncEventNotifications(parsedEvent);
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
