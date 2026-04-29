import { describe, it, expect } from "vitest";
import {
  DEVICE_CALENDAR_ID_PREFIX,
  deviceCalendarColor,
  deviceCalendarIdFor,
  deviceEventToCalendarEvent,
} from "./deviceCalendarAdapter";
import type {
  DeviceCalendarEvent,
  DeviceCalendarInfo,
} from "../plugins/deviceCalendar";

const baseInfo: DeviceCalendarInfo = {
  id: "42",
  name: "Work",
  accountName: "user@example.com",
  color: "#4285F4",
  isPrimary: true,
  canWrite: true,
};

const baseEvent: DeviceCalendarEvent = {
  id: "100:42",
  calendarId: "42",
  title: "Standup",
  description: "Daily team sync",
  location: "HQ",
  beginMs: 1_700_000_000_000,
  endMs: 1_700_000_900_000,
  allDay: false,
  organizer: "alice@example.com",
};

describe("deviceCalendarAdapter", () => {
  it("namespaces native calendar ids", () => {
    expect(deviceCalendarIdFor("42")).toBe(`${DEVICE_CALENDAR_ID_PREFIX}42`);
  });

  it("normalizes a native event into ICalendarEvent shape", () => {
    const ce = deviceEventToCalendarEvent(baseEvent);
    expect(ce.source).toBe("device");
    expect(ce.allDay).toBe(false);
    expect(ce.calendarId).toBe(`${DEVICE_CALENDAR_ID_PREFIX}42`);
    expect(ce.title).toBe("Standup");
    expect(ce.begin).toBe(baseEvent.beginMs);
    expect(ce.end).toBe(baseEvent.endMs);
    expect(ce.location).toEqual(["HQ"]);
    expect(ce.user).toBe("alice@example.com");
    // Nostr-only fields default safely.
    expect(ce.eventId).toBe("");
    expect(ce.kind).toBe(-1);
    expect(ce.isPrivateEvent).toBe(false);
    expect(ce.repeat).toEqual({ rrule: null });
    expect(ce.rsvpResponses).toEqual([]);
  });

  it("preserves all-day events as allDay=true", () => {
    const allDay = { ...baseEvent, allDay: true };
    expect(deviceEventToCalendarEvent(allDay).allDay).toBe(true);
  });

  it("preserves rrule when present and falls back to null otherwise", () => {
    const recurring = { ...baseEvent, rrule: "FREQ=DAILY;COUNT=5" };
    expect(deviceEventToCalendarEvent(recurring).repeat.rrule).toBe(
      "FREQ=DAILY;COUNT=5",
    );
    expect(deviceEventToCalendarEvent(baseEvent).repeat.rrule).toBeNull();
  });

  it("emits an empty location array when the native location is empty", () => {
    const noLoc = { ...baseEvent, location: "" };
    expect(deviceEventToCalendarEvent(noLoc).location).toEqual([]);
  });

  it("provides a placeholder title for events with no name", () => {
    const noTitle = { ...baseEvent, title: "" };
    expect(deviceEventToCalendarEvent(noTitle).title).toBe("(No title)");
  });

  it("returns a fallback color for invalid hex input", () => {
    expect(deviceCalendarColor(baseInfo)).toBe("#4285F4");
    expect(deviceCalendarColor({ ...baseInfo, color: "" })).toBe("#4285f4");
    expect(deviceCalendarColor({ ...baseInfo, color: "not a color" })).toBe(
      "#4285f4",
    );
  });
});
