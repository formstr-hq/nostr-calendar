import { describe, it, expect, beforeEach, vi } from "vitest";
import { useCalendarLists } from "./calendarLists";

// Mock secure storage
vi.mock("../common/localStorage", () => ({
  getSecureItem: vi.fn().mockResolvedValue([]),
  setSecureItem: vi.fn(),
  removeSecureItem: vi.fn(),
}));

// Mock calendarList protocol layer
vi.mock("../common/calendarList", () => ({
  fetchCalendarLists: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
  publishCalendarList: vi.fn().mockResolvedValue({}),
  createDefaultCalendar: vi.fn().mockResolvedValue({
    id: "default-cal-id",
    title: "My Calendar",
    description: "",
    color: "#4285f4",
    eventRefs: [],
    createdAt: 1700000000,
    isVisible: true,
  }),
  addEventToCalendarList: vi
    .fn()
    .mockImplementation((cal, ref) =>
      Promise.resolve({ ...cal, eventRefs: [...cal.eventRefs, ref] }),
    ),
  removeEventFromCalendarList: vi.fn().mockImplementation((cal, ref) =>
    Promise.resolve({
      ...cal,
      eventRefs: cal.eventRefs.filter((r: string) => r !== ref),
    }),
  ),
}));

// Mock nostr getUserPublicKey
vi.mock("../common/nostr", () => ({
  getUserPublicKey: vi.fn().mockResolvedValue("test-pubkey-" + "0".repeat(50)),
  getRelays: vi.fn().mockReturnValue(["wss://relay.test"]),
  publishToRelays: vi.fn().mockResolvedValue("ok"),
}));

describe("useCalendarLists store", () => {
  beforeEach(() => {
    // Reset store state between tests
    useCalendarLists.setState({
      calendars: [],
      isLoaded: false,
    });
  });

  it("starts with empty calendars", () => {
    const state = useCalendarLists.getState();
    expect(state.calendars).toEqual([]);
    expect(state.isLoaded).toBe(false);
  });

  it("creates a calendar with correct properties", async () => {
    await useCalendarLists
      .getState()
      .createCalendar("Work", "Work events", "#d50000");

    const { calendars } = useCalendarLists.getState();
    expect(calendars).toHaveLength(1);
    expect(calendars[0].title).toBe("Work");
    expect(calendars[0].description).toBe("Work events");
    expect(calendars[0].color).toBe("#d50000");
    expect(calendars[0].isVisible).toBe(true);
    expect(calendars[0].eventRefs).toEqual([]);
    expect(calendars[0].id).toBeTruthy();
  });

  it("creates a calendar with default color", async () => {
    await useCalendarLists.getState().createCalendar("Personal");

    const { calendars } = useCalendarLists.getState();
    expect(calendars[0].color).toBe("#4285f4");
  });

  it("toggles calendar visibility", async () => {
    await useCalendarLists.getState().createCalendar("Test");
    const calId = useCalendarLists.getState().calendars[0].id;

    expect(useCalendarLists.getState().calendars[0].isVisible).toBe(true);

    useCalendarLists.getState().toggleVisibility(calId);
    expect(useCalendarLists.getState().calendars[0].isVisible).toBe(false);

    useCalendarLists.getState().toggleVisibility(calId);
    expect(useCalendarLists.getState().calendars[0].isVisible).toBe(true);
  });

  it("adds an event ref to a calendar", async () => {
    await useCalendarLists.getState().createCalendar("Test");
    const calId = useCalendarLists.getState().calendars[0].id;

    const eventRef = [
      "32678:testpubkey:event-123",
      "",
      "nsec1key:1700000000::1700003600:false",
    ];
    await useCalendarLists.getState().addEventToCalendar(calId, eventRef);

    const { calendars } = useCalendarLists.getState();
    expect(calendars[0].eventRefs).toContainEqual(eventRef);
  });

  it("removes an event ref from a calendar", async () => {
    await useCalendarLists.getState().createCalendar("Test");
    const calId = useCalendarLists.getState().calendars[0].id;

    const eventRef = [
      "32678:testpubkey:event-123",
      "",
      "nsec1key:1700000000::1700003600:false",
    ];
    await useCalendarLists.getState().addEventToCalendar(calId, eventRef);
    await useCalendarLists.getState().removeEventFromCalendar(calId, eventRef);

    const { calendars } = useCalendarLists.getState();
    expect(calendars[0].eventRefs).not.toContainEqual(eventRef);
  });

  it("getVisibleEventRefs returns refs only from visible calendars", async () => {
    await useCalendarLists.getState().createCalendar("Visible", "", "#4285f4");
    await useCalendarLists.getState().createCalendar("Hidden", "", "#d50000");

    const calendars = useCalendarLists.getState().calendars;
    const visibleId = calendars[0].id;
    const hiddenId = calendars[1].id;

    const ref1 = [
      "32678:pubkey1:event-1",
      "",
      "nsec1a:1700000000::1700003600:false",
    ];
    const ref2 = [
      "32678:pubkey2:event-2",
      "",
      "nsec1b:1700000000::1700003600:false",
    ];
    await useCalendarLists.getState().addEventToCalendar(visibleId, ref1);
    await useCalendarLists.getState().addEventToCalendar(hiddenId, ref2);

    // Hide the second calendar
    useCalendarLists.getState().toggleVisibility(hiddenId);

    const visibleRefs = useCalendarLists.getState().getVisibleEventRefs();
    expect(visibleRefs).toContainEqual(ref1);
    expect(visibleRefs).not.toContainEqual(ref2);
  });

  it("getAllEventIds returns IDs from all calendars regardless of visibility", async () => {
    await useCalendarLists.getState().createCalendar("Cal1");
    await useCalendarLists.getState().createCalendar("Cal2");

    const calendars = useCalendarLists.getState().calendars;
    const ref1 = [
      "32678:pubkey1:event-abc",
      "",
      "nsec1a:1700000000::1700003600:false",
    ];
    const ref2 = [
      "32678:pubkey2:event-xyz",
      "",
      "nsec1b:1700000000::1700003600:false",
    ];
    await useCalendarLists.getState().addEventToCalendar(calendars[0].id, ref1);
    await useCalendarLists.getState().addEventToCalendar(calendars[1].id, ref2);

    // Hide one calendar
    useCalendarLists.getState().toggleVisibility(calendars[1].id);

    const allIds = useCalendarLists.getState().getAllEventIds();
    expect(allIds).toContain("event-abc");
    expect(allIds).toContain("event-xyz");
  });

  it("deletes a calendar", async () => {
    await useCalendarLists.getState().createCalendar("ToDelete");
    const calId = useCalendarLists.getState().calendars[0].id;

    await useCalendarLists.getState().deleteCalendar(calId);
    expect(useCalendarLists.getState().calendars).toHaveLength(0);
  });

  it("updates calendar metadata", async () => {
    await useCalendarLists
      .getState()
      .createCalendar("Old Name", "Old desc", "#4285f4");
    const cal = useCalendarLists.getState().calendars[0];

    await useCalendarLists.getState().updateCalendar({
      ...cal,
      title: "New Name",
      description: "New desc",
      color: "#d50000",
    });

    const updated = useCalendarLists.getState().calendars[0];
    expect(updated.title).toBe("New Name");
    expect(updated.description).toBe("New desc");
    expect(updated.color).toBe("#d50000");
  });

  it("clears all cached calendars on logout", async () => {
    await useCalendarLists.getState().createCalendar("Test");
    expect(useCalendarLists.getState().calendars).toHaveLength(1);

    await useCalendarLists.getState().clearCachedCalendars();
    expect(useCalendarLists.getState().calendars).toHaveLength(0);
    expect(useCalendarLists.getState().isLoaded).toBe(false);
  });
});
