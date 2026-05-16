import { describe, expect, it } from "vitest";
import { getEventPage } from "./routingHelper";

describe("getEventPage", () => {
  it("includes occurrence params when opening a concrete recurring occurrence", () => {
    const url = getEventPage("naddr1example", "view-secret", {
      begin: 1_775_901_600_000,
      end: 1_775_905_200_000,
    });

    expect(url).toBe(
      "/event/naddr1example?viewKey=view-secret&occurrenceStart=1775901600000&occurrenceEnd=1775905200000",
    );
  });

  it("does not append an empty query string", () => {
    expect(getEventPage("naddr1example")).toBe("/event/naddr1example");
  });
});
