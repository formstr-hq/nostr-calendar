import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTimeBasedEvents } from "./events";
import {
  cancelEventNotifications,
  scheduleEventNotifications,
} from "../utils/notifications";
import { clearNotificationPreference } from "../utils/notificationPreferences";

vi.mock("../common/localStorage", () => ({
  getSecureItem: vi.fn().mockResolvedValue([]),
  setSecureItem: vi.fn(),
  removeSecureItem: vi.fn(),
}));

vi.mock("../common/nostr", () => ({
  fetchCalendarEvents: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  fetchPrivateCalendarEvents: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  viewPrivateEvent: vi.fn(),
}));

vi.mock("../common/calendarList", () => ({
  fetchCalendarLists: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  publishCalendarList: vi.fn().mockResolvedValue({}),
  createDefaultCalendar: vi.fn(),
  addEventToCalendarList: vi.fn(),
  removeEventFromCalendarList: vi.fn(),
}));

vi.mock("../utils/notifications", () => ({
  scheduleEventNotifications: vi.fn(),
  cancelEventNotifications: vi.fn(),
}));

vi.mock("../utils/notificationPreferences", () => ({
  clearNotificationPreference: vi.fn(),
}));

describe("event notification lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTimeBasedEvents.setState({
      events: [],
      eventById: {},
      isCacheLoaded: false,
    });
  });

  it("reschedules notifications when updating an event", async () => {
    const event = {
      id: "event-123",
      eventId: "event-123",
      title: "Original Event",
      description: "",
      begin: 1700000000000,
      end: 1700003600000,
      kind: 31923,
      createdAt: 1700000000,
      categories: [],
      participants: [],
      rsvpResponses: [],
      reference: [],
      location: [],
      geoHash: [],
      website: "",
      user: "someone",
      isPrivateEvent: false,
      repeat: { rrule: null },
    };

    useTimeBasedEvents.setState({
      events: [event],
      eventById: { [event.id]: event },
      isCacheLoaded: true,
    });

    vi.mocked(cancelEventNotifications).mockResolvedValue(undefined);
    vi.mocked(scheduleEventNotifications).mockResolvedValue([]);

    useTimeBasedEvents.getState().updateEvent({
      ...event,
      title: "Updated Event",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(cancelEventNotifications).toHaveBeenCalledWith("event-123");
    expect(scheduleEventNotifications).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "event-123",
        title: "Updated Event",
      }),
    );
  });

  it("clears notification preferences when removing an event", () => {
    useTimeBasedEvents.setState({
      events: [
        {
          id: "event-123",
          eventId: "event-123",
          title: "Test Event",
          description: "",
          begin: 1700000000000,
          end: 1700003600000,
          kind: 31923,
          createdAt: 1700000000,
          categories: [],
          participants: [],
          rsvpResponses: [],
          reference: [],
          location: [],
          geoHash: [],
          website: "",
          user: "someone",
          isPrivateEvent: false,
          repeat: { rrule: null },
        },
      ],
      eventById: {},
      isCacheLoaded: true,
    });

    useTimeBasedEvents.getState().removeEvent("event-123");

    expect(clearNotificationPreference).toHaveBeenCalledWith("event-123");
  });
});
