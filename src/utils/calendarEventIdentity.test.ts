import { describe, expect, it } from "vitest";
import { TEMP_CALENDAR_ID } from "../stores/eventDetails";
import { getPersistedCalendarEventId } from "./calendarEventIdentity";

describe("getPersistedCalendarEventId", () => {
  it("preserves the d-tag of an existing event", () => {
    expect(getPersistedCalendarEventId("existing-d-tag")).toBe(
      "existing-d-tag",
    );
  });

  it("rejects unsaved event identities", () => {
    expect(getPersistedCalendarEventId("")).toBeUndefined();
    expect(getPersistedCalendarEventId(undefined)).toBeUndefined();
    expect(getPersistedCalendarEventId(TEMP_CALENDAR_ID)).toBeUndefined();
  });
});
