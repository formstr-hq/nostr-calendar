import { describe, it, expect, vi, beforeEach } from "vitest";
import { ICalendarEvent } from "./types";

// ─── Mocks ──────────────────────────────────────────────────────────

const mockSchedule = vi.fn().mockResolvedValue(undefined);
const mockCancel = vi.fn().mockResolvedValue(undefined);
const mockGetPending = vi.fn().mockResolvedValue({ notifications: [] });
const mockRequestPermissions = vi
  .fn()
  .mockResolvedValue({ display: "granted" });
const mockAddListener = vi.fn().mockResolvedValue({ remove: vi.fn() });

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    schedule: (...args: unknown[]) => mockSchedule(...args),
    cancel: (...args: unknown[]) => mockCancel(...args),
    getPending: (...args: unknown[]) => mockGetPending(...args),
    requestPermissions: (...args: unknown[]) => mockRequestPermissions(...args),
    addListener: (...args: unknown[]) => mockAddListener(...args),
  },
}));

vi.mock("./platform", () => ({
  isNative: true,
}));

// Import AFTER mocks are set up
const {
  scheduleEventNotifications,
  cancelAllNotifications,
  cancelEventNotifications,
} = await import("./notifications");

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function makeEvent(
  overrides: Partial<ICalendarEvent> & { begin: number },
): ICalendarEvent {
  return {
    id: "test-id",
    eventId: overrides.eventId ?? "evt-123",
    title: "Test Event",
    description: "",
    kind: 31923,
    end: overrides.end ?? overrides.begin + HOUR,
    createdAt: Date.now(),
    categories: [],
    participants: [],
    rsvpResponses: [],
    reference: [],
    location: [],
    geoHash: [],
    website: "",
    user: "test-user",
    isPrivateEvent: false,
    repeat: { rrules: [] },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("scheduleEventNotifications", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetPending.mockResolvedValue({ notifications: [] });
    mockRequestPermissions.mockResolvedValue({ display: "granted" });

    // Cancel all to reset internal state
    await cancelAllNotifications();
  });

  it("schedules 2 notifications for a future non-repeating event", async () => {
    const futureStart = Date.now() + HOUR;
    const event = makeEvent({ begin: futureStart });

    await scheduleEventNotifications(event);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const scheduled = mockSchedule.mock.calls[0][0].notifications;
    expect(scheduled).toHaveLength(2);
    expect(scheduled[0].title).toBe("Upcoming: Test Event");
    expect(scheduled[0].body).toBe("Starts in 10 minutes");
    expect(scheduled[1].title).toBe("Test Event");
    expect(scheduled[1].body).toBe("Starting now");
  });

  it("schedules only 'starting now' when event is less than 10 min away", async () => {
    const futureStart = Date.now() + 5 * 60 * 1000; // 5 minutes from now
    const event = makeEvent({ begin: futureStart });

    await scheduleEventNotifications(event);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const scheduled = mockSchedule.mock.calls[0][0].notifications;
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0].body).toBe("Starting now");
  });

  it("includes location in notification body when location exists", async () => {
    const futureStart = Date.now() + HOUR;
    const event = makeEvent({
      begin: futureStart,
      location: ["Conference Room A"],
    });

    await scheduleEventNotifications(event);

    const scheduled = mockSchedule.mock.calls[0][0].notifications;
    expect(scheduled[0].body).toBe("Starts in 10 minutes at Conference Room A");
    expect(scheduled[1].body).toBe("Starting now at Conference Room A");
  });

  it("omits location from notification body when location is empty", async () => {
    const futureStart = Date.now() + HOUR;
    const event = makeEvent({ begin: futureStart, location: [] });

    await scheduleEventNotifications(event);

    const scheduled = mockSchedule.mock.calls[0][0].notifications;
    expect(scheduled[0].body).toBe("Starts in 10 minutes");
    expect(scheduled[1].body).toBe("Starting now");
  });

  it("uses first location when multiple locations exist", async () => {
    const futureStart = Date.now() + HOUR;
    const event = makeEvent({
      begin: futureStart,
      location: ["Main Hall", "Room 101"],
    });

    await scheduleEventNotifications(event);

    const scheduled = mockSchedule.mock.calls[0][0].notifications;
    expect(scheduled[0].body).toBe("Starts in 10 minutes at Main Hall");
    expect(scheduled[1].body).toBe("Starting now at Main Hall");
  });

  it("skips events that have already started (non-repeating)", async () => {
    const pastStart = Date.now() - HOUR;
    const event = makeEvent({ begin: pastStart });

    await scheduleEventNotifications(event);

    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("skips non-repeating events more than 5 days away", async () => {
    const farFuture = Date.now() + 6 * DAY;
    const event = makeEvent({ begin: farFuture });

    await scheduleEventNotifications(event);

    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("does not schedule the same non-repeating event twice", async () => {
    const futureStart = Date.now() + HOUR;
    const event = makeEvent({ begin: futureStart });

    await scheduleEventNotifications(event);
    await scheduleEventNotifications(event);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it("does not schedule when permissions are denied", async () => {
    mockRequestPermissions.mockResolvedValueOnce({ display: "denied" });
    const futureStart = Date.now() + HOUR;
    const event = makeEvent({ begin: futureStart });

    await scheduleEventNotifications(event);

    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("includes id and notificationKey in notification extras", async () => {
    const futureStart = Date.now() + HOUR;
    const event = makeEvent({ begin: futureStart, id: "my-event-id" });

    await scheduleEventNotifications(event);

    const scheduled = mockSchedule.mock.calls[0][0].notifications;
    expect(scheduled[0].extra.eventId).toBe("my-event-id");
    expect(scheduled[0].extra.notificationKey).toBe("my-event-id");
  });
});

describe("scheduleEventNotifications – recurring events", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetPending.mockResolvedValue({ notifications: [] });
    mockRequestPermissions.mockResolvedValue({ display: "granted" });
    await cancelAllNotifications();
  });

  it("schedules notification for a daily recurring event with next occurrence today", async () => {
    // Event started 10 days ago at 1 hour from now (same time of day),
    // so today's occurrence is 1 hour in the future
    const startTime = Date.now() + HOUR - 10 * DAY;
    const event = makeEvent({
      begin: startTime,
      id: "daily-evt",
      repeat: { rrules: ["FREQ=DAILY"] },
    });

    await scheduleEventNotifications(event);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const scheduled = mockSchedule.mock.calls[0][0].notifications;
    expect(scheduled.length).toBeGreaterThan(0);
    expect(scheduled[0].extra.eventId).toBe("daily-evt");
    // Notification key should include occurrence timestamp
    expect(scheduled[0].extra.notificationKey).toContain("daily-evt:");
  });

  it("does not schedule for a weekly recurring event whose next occurrence is > 5 days away", async () => {
    const now = Date.now();
    // Event started 1 day ago weekly, next occurrence is 6 days from now → out of 5-day window
    const startDate = now - 1 * DAY;
    const event = makeEvent({
      begin: startDate,
      id: "weekly-far",
      repeat: { rrules: ["FREQ=WEEKLY"] },
    });

    await scheduleEventNotifications(event);

    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("schedules for a weekly recurring event with occurrence within 5 days", async () => {
    // Event started exactly 7 days ago → next occurrence is now (today)
    const oneWeekAgo = Date.now() - 7 * DAY + HOUR; // +1h so it's in the future
    const event = makeEvent({
      begin: oneWeekAgo,
      id: "weekly-soon",
      repeat: { rrules: ["FREQ=WEEKLY"] },
    });

    await scheduleEventNotifications(event);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it("does not schedule the same occurrence of a recurring event twice", async () => {
    const startTime = Date.now() + HOUR - 10 * DAY;
    const event = makeEvent({
      begin: startTime,
      id: "daily-dedup",
      repeat: { rrules: ["FREQ=DAILY"] },
    });

    await scheduleEventNotifications(event);
    await scheduleEventNotifications(event);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it("uses unique notification IDs for different occurrences", async () => {
    // Two different daily events → should get different IDs
    const startTime = Date.now() + HOUR - 10 * DAY;
    const event1 = makeEvent({
      begin: startTime,
      id: "evt-a",
      repeat: { rrules: ["FREQ=DAILY"] },
    });
    const event2 = makeEvent({
      begin: startTime,
      id: "evt-b",
      repeat: { rrules: ["FREQ=DAILY"] },
    });

    await scheduleEventNotifications(event1);
    await scheduleEventNotifications(event2);

    expect(mockSchedule).toHaveBeenCalledTimes(2);
    const ids1 = mockSchedule.mock.calls[0][0].notifications.map(
      (n: { id: number }) => n.id,
    );
    const ids2 = mockSchedule.mock.calls[1][0].notifications.map(
      (n: { id: number }) => n.id,
    );
    // IDs should not overlap
    for (const id of ids1) {
      expect(ids2).not.toContain(id);
    }
  });

  it("notification key for recurring events includes occurrence timestamp", async () => {
    const startTime = Date.now() + HOUR - 10 * DAY;
    const event = makeEvent({
      begin: startTime,
      id: "recurring-key-test",
      repeat: { rrules: ["FREQ=DAILY"] },
    });

    await scheduleEventNotifications(event);

    const scheduled = mockSchedule.mock.calls[0][0].notifications;
    const key = scheduled[0].extra.notificationKey;
    expect(key).toMatch(/^recurring-key-test:\d+$/);
  });
});

describe("cancelAllNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels all pending notifications", async () => {
    mockGetPending.mockResolvedValueOnce({
      notifications: [{ id: 1 }, { id: 2 }],
    });

    await cancelAllNotifications();

    expect(mockCancel).toHaveBeenCalledWith({
      notifications: [{ id: 1 }, { id: 2 }],
    });
  });

  it("does nothing when there are no pending notifications", async () => {
    mockGetPending.mockResolvedValueOnce({ notifications: [] });

    await cancelAllNotifications();

    expect(mockCancel).not.toHaveBeenCalled();
  });
});

describe("cancelEventNotifications", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetPending.mockResolvedValue({ notifications: [] });
    mockRequestPermissions.mockResolvedValue({ display: "granted" });
    await cancelAllNotifications();
  });

  it("cancels notifications matching the event ID", async () => {
    // First schedule a notification
    const futureStart = Date.now() + HOUR;
    const event = makeEvent({ begin: futureStart, id: "cancel-me" });
    await scheduleEventNotifications(event);

    // Now set up getPending to return those notifications
    const scheduledNotifs = mockSchedule.mock.calls[0][0].notifications;
    mockGetPending.mockResolvedValueOnce({ notifications: scheduledNotifs });

    await cancelEventNotifications("cancel-me");

    expect(mockCancel).toHaveBeenCalledWith({
      notifications: scheduledNotifs,
    });
  });

  it("allows rescheduling after cancellation", async () => {
    const futureStart = Date.now() + HOUR;
    const event = makeEvent({ begin: futureStart, id: "reschedule-me" });

    await scheduleEventNotifications(event);
    expect(mockSchedule).toHaveBeenCalledTimes(1);

    // Cancel
    mockGetPending.mockResolvedValueOnce({
      notifications: mockSchedule.mock.calls[0][0].notifications,
    });
    await cancelEventNotifications("reschedule-me");

    // Should be able to schedule again
    await scheduleEventNotifications(event);
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });
});
