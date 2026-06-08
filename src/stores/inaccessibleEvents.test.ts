import { describe, it, expect, beforeEach } from "vitest";
import { useInaccessibleEvents } from "./inaccessibleEvents";

const makeEntry = (coordinate: string, dTag: string) => ({
  coordinate,
  kind: 32678,
  authorPubkey: "author",
  dTag,
  calendarId: "cal-1",
});

describe("useInaccessibleEvents", () => {
  beforeEach(() => {
    useInaccessibleEvents.setState({ byCoordinate: {} });
  });

  it("records an inaccessible event keyed by coordinate", () => {
    const { record } = useInaccessibleEvents.getState();
    record(makeEntry("32678:author:a", "a"));

    const entry =
      useInaccessibleEvents.getState().byCoordinate["32678:author:a"];
    expect(entry).toBeDefined();
    expect(entry.dTag).toBe("a");
    expect(entry.lastSeenAt).toBeGreaterThan(0);
  });

  it("deduplicates by coordinate, refreshing the existing entry", () => {
    const { record } = useInaccessibleEvents.getState();
    record(makeEntry("32678:author:a", "a"));
    record(makeEntry("32678:author:a", "a"));

    expect(Object.keys(useInaccessibleEvents.getState().byCoordinate)).toEqual([
      "32678:author:a",
    ]);
  });

  it("removes an entry by coordinate", () => {
    const { record, remove } = useInaccessibleEvents.getState();
    record(makeEntry("32678:author:a", "a"));
    remove("32678:author:a");

    expect(
      useInaccessibleEvents.getState().byCoordinate["32678:author:a"],
    ).toBeUndefined();
  });

  it("lists entries most-recently-seen first", () => {
    const { record } = useInaccessibleEvents.getState();
    record(makeEntry("32678:author:a", "a"));
    // Force a strictly later lastSeenAt on the second entry.
    useInaccessibleEvents.setState((state) => ({
      byCoordinate: {
        ...state.byCoordinate,
        "32678:author:b": {
          ...makeEntry("32678:author:b", "b"),
          lastSeenAt: state.byCoordinate["32678:author:a"].lastSeenAt + 10,
        },
      },
    }));

    const list = useInaccessibleEvents.getState().list();
    expect(list.map((e) => e.dTag)).toEqual(["b", "a"]);
  });
});
