import { describe, it, expect, vi, beforeEach } from "vitest";
import { ICalendarEvent } from "./types";

// ─── Mocks ──────────────────────────────────────────────────────────

const mockSchedule = vi.fn().mockResolvedValue(undefined);
const mockCancel = vi.fn().mockResolvedValue(undefined);
const mockGetPending = vi.fn().mockResolvedValue({ notifications: [] });
const mockRequestPermissions = vi
  .fn()
  .mockResolvedValue({ display: "granted" });
const mockCheckPermissions = vi.fn().mockResolvedValue({ display: "granted" });
const mockAddListener = vi.fn().mockResolvedValue({ remove: vi.fn() });
const mockGetNotificationOffsetsForEvent = vi.fn().mockResolvedValue([10, 0]);
const mockIsAndroidNative = vi.fn(() => false);
const mockReconcileNotificationSchedule = vi.fn().mockResolvedValue(undefined);
const mockCancelBackgroundEventNotifications = vi
  .fn()
  .mockResolvedValue(undefined);
const mockClearBackgroundNotificationSchedule = vi
  .fn()
  .mockResolvedValue(undefined);

vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: {
    schedule: (...args: unknown[]) => mockSchedule(...args),
    cancel: (...args: unknown[]) => mockCancel(...args),
    getPending: (...args: unknown[]) => mockGetPending(...args),
    checkPermissions: (...args: unknown[]) => mockCheckPermissions(...args),
    requestPermissions: (...args: unknown[]) => mockRequestPermissions(...args),
    addListener: (...args: unknown[]) => mockAddListener(...args),
  },
}));

vi.mock("./platform", () => ({
  isNative: true,
  isAndroidNative: () => mockIsAndroidNative(),
}));

vi.mock("../plugins/notificationScheduler", () => ({
  reconcileNotificationSchedule: (...args: unknown[]) =>
    mockReconcileNotificationSchedule(...args),
  cancelBackgroundEventNotifications: (...args: unknown[]) =>
    mockCancelBackgroundEventNotifications(...args),
  clearBackgroundNotificationSchedule: (...args: unknown[]) =>
    mockClearBackgroundNotificationSchedule(...args),
}));

vi.mock("./notificationPreferences", () => ({
  getNotificationOffsetsForEvent: (...args: unknown[]) =>
    mockGetNotificationOffsetsForEvent(...args),
  formatNotificationOffsetLabel: (offsetMinutes: number) =>
    offsetMinutes === 0
      ? "At event start"
      : `${offsetMinutes} minute${offsetMinutes === 1 ? "" : "s"} before`,
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
    calendarId: "",
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
    repeat: { rrule: null },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe("scheduleEventNotifications", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsAndroidNative.mockReturnValue(false);
    mockGetPending.mockResolvedValue({ notifications: [] });
    mockRequestPermissions.mockResolvedValue({ display: "granted" });
    mockCheckPermissions.mockResolvedValue({ display: "granted" });
    mockGetNotificationOffsetsForEvent.mockResolvedValue([10, 0]);

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

  it("skips non-repeating events whose reminders are beyond 48 hours", async () => {
    const farFuture = Date.now() + 3 * DAY;
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
    mockCheckPermissions.mockResolvedValueOnce({ display: "prompt" });
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
    expect(scheduled[0].extra.notificationKey).toMatch(
      /^v2:my-event-id:\d+:m\d+$/,
    );
  });

  it("cancels legacy unversioned pending notifications during startup", async () => {
    const futureStart = Date.now() + HOUR;
    const legacyNotification = {
      id: 1,
      extra: {
        eventId: "legacy-event",
        notificationKey: "legacy-event:1700000000000:10",
      },
    };
    const currentNotification = {
      id: 2,
      extra: {
        eventId: "current-event",
        notificationKey: `v2:current-event:${futureStart}:m10`,
      },
    };

    mockGetPending.mockResolvedValueOnce({
      notifications: [legacyNotification, currentNotification],
    });

    await scheduleEventNotifications(
      makeEvent({ begin: futureStart, id: "migration-event" }),
    );

    expect(mockCancel).toHaveBeenCalledWith({
      notifications: [legacyNotification],
    });
  });

  it("supports multiple custom reminder offsets", async () => {
    mockGetNotificationOffsetsForEvent.mockResolvedValueOnce([60, 15, 0]);
    const futureStart = Date.now() + 2 * HOUR;
    const event = makeEvent({ begin: futureStart, id: "custom-reminders" });

    const result = await scheduleEventNotifications(event);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const scheduled = mockSchedule.mock.calls[0][0].notifications;
    expect(scheduled).toHaveLength(3);
    expect(result.map((notification) => notification.label)).toEqual([
      "60 minutes before",
      "15 minutes before",
      "At event start",
    ]);
  });

  it("skips scheduling when notifications are disabled for an event", async () => {
    mockGetNotificationOffsetsForEvent.mockResolvedValueOnce([]);
    const futureStart = Date.now() + HOUR;
    const event = makeEvent({ begin: futureStart, id: "disabled-reminders" });

    const result = await scheduleEventNotifications(event);

    expect(result).toEqual([]);
    expect(mockSchedule).not.toHaveBeenCalled();
  });
});

describe("scheduleEventNotifications – recurring events", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockIsAndroidNative.mockReturnValue(false);
    mockGetPending.mockResolvedValue({ notifications: [] });
    mockRequestPermissions.mockResolvedValue({ display: "granted" });
    mockCheckPermissions.mockResolvedValue({ display: "granted" });
    mockGetNotificationOffsetsForEvent.mockResolvedValue([10, 0]);
    await cancelAllNotifications();
  });

  it("schedules notification for a daily recurring event with next occurrence today", async () => {
    // Event started 10 days ago at 1 hour from now (same time of day),
    // so today's occurrence is 1 hour in the future
    const startTime = Date.now() + HOUR - 10 * DAY;
    const event = makeEvent({
      begin: startTime,
      id: "daily-evt",
      repeat: { rrule: "FREQ=DAILY" },
    });

    await scheduleEventNotifications(event);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    const scheduled = mockSchedule.mock.calls[0][0].notifications;
    expect(scheduled.length).toBeGreaterThan(0);
    expect(scheduled[0].extra.eventId).toBe("daily-evt");
    // Notification key should include occurrence timestamp
    expect(scheduled[0].extra.notificationKey).toContain(":daily-evt:");
  });

  it("schedules every daily occurrence whose reminders fall in the next 48 hours", async () => {
    const startTime = Date.now() + HOUR - 10 * DAY;
    const event = makeEvent({
      begin: startTime,
      id: "daily-window",
      repeat: { rrule: "FREQ=DAILY" },
    });

    await scheduleEventNotifications(event);

    const scheduled = mockSchedule.mock.calls[0][0].notifications;
    const occurrenceStarts = new Set(
      scheduled.map(
        (notification: { extra: { notificationKey: string } }) =>
          notification.extra.notificationKey.split(":")[2],
      ),
    );
    expect(occurrenceStarts.size).toBe(2);
    expect(scheduled).toHaveLength(4);
  });

  it("does not schedule a weekly recurrence outside the 48-hour window", async () => {
    const now = Date.now();
    // Event started 1 day ago weekly, so the next occurrence is 6 days away.
    const startDate = now - 1 * DAY;
    const event = makeEvent({
      begin: startDate,
      id: "weekly-far",
      repeat: { rrule: "FREQ=WEEKLY" },
    });

    await scheduleEventNotifications(event);

    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("schedules a weekly recurring event with an occurrence within 48 hours", async () => {
    // Event started exactly 7 days ago → next occurrence is now (today)
    const oneWeekAgo = Date.now() - 7 * DAY + HOUR; // +1h so it's in the future
    const event = makeEvent({
      begin: oneWeekAgo,
      id: "weekly-soon",
      repeat: { rrule: "FREQ=WEEKLY" },
    });

    await scheduleEventNotifications(event);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it("does not schedule the same occurrence of a recurring event twice", async () => {
    const startTime = Date.now() + HOUR - 10 * DAY;
    const event = makeEvent({
      begin: startTime,
      id: "daily-dedup",
      repeat: { rrule: "FREQ=DAILY" },
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
      repeat: { rrule: "FREQ=DAILY" },
    });
    const event2 = makeEvent({
      begin: startTime,
      id: "evt-b",
      repeat: { rrule: "FREQ=DAILY" },
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
      repeat: { rrule: "FREQ=DAILY" },
    });

    await scheduleEventNotifications(event);

    const scheduled = mockSchedule.mock.calls[0][0].notifications;
    const key = scheduled[0].extra.notificationKey;
    expect(key).toMatch(/^v2:recurring-key-test:\d+:m\d+$/);
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
    mockIsAndroidNative.mockReturnValue(false);
    mockGetPending.mockResolvedValue({ notifications: [] });
    mockRequestPermissions.mockResolvedValue({ display: "granted" });
    mockCheckPermissions.mockResolvedValue({ display: "granted" });
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

  it("cancels Android alarms synchronously before reconciliation", async () => {
    mockIsAndroidNative.mockReturnValue(true);

    await cancelEventNotifications("deleted-event");

    expect(mockCancelBackgroundEventNotifications).toHaveBeenCalledWith(
      "deleted-event",
    );
    expect(mockReconcileNotificationSchedule).toHaveBeenCalledTimes(1);
  });
});
