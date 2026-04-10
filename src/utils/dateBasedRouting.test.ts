import { describe, expect, it } from "vitest";
import { getDateFromRoute, getRouteFromDate } from "./dateBasedRouting";

describe("dateBasedRouting", () => {
  it("keeps week routes aligned to local midnight", () => {
    const date = getDateFromRoute({ year: "2026", weekNumber: "15" });

    expect(date.format("HH:mm")).toBe("00:00");
  });

  it("round-trips a week route", () => {
    const date = getDateFromRoute({ year: "2026", weekNumber: "15" });

    expect(getRouteFromDate(date, "week")).toBe("/w/2026/15");
  });
});
