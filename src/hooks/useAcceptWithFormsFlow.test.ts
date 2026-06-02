import { describe, expect, it } from "vitest";
import {
  createPendingAcceptWithForms,
  getNextPendingAcceptWithForms,
} from "./useAcceptWithFormsFlow";

const attachments = [{ naddr: "naddr1first" }, { naddr: "naddr1second" }];

describe("useAcceptWithFormsFlow helpers", () => {
  it("returns null when there are no attachments", () => {
    expect(
      createPendingAcceptWithForms({
        calendarId: "cal-1",
        attachments: [],
        context: "event-1",
      }),
    ).toBeNull();
  });

  it("creates pending acceptance from the first attachment", () => {
    expect(
      createPendingAcceptWithForms({
        calendarId: "cal-1",
        giftWrapId: "wrap-1",
        attachments,
        context: "event-1",
      }),
    ).toEqual({
      calendarId: "cal-1",
      giftWrapId: "wrap-1",
      attachments,
      context: "event-1",
      formIndex: 0,
    });
  });

  it("advances until the final attachment, then returns null", () => {
    const pendingAccept = createPendingAcceptWithForms({
      calendarId: "cal-1",
      giftWrapId: "wrap-1",
      attachments,
      context: "event-1",
    });

    expect(pendingAccept).not.toBeNull();
    expect(getNextPendingAcceptWithForms(pendingAccept!)).toEqual({
      ...pendingAccept,
      formIndex: 1,
    });
    expect(
      getNextPendingAcceptWithForms({
        ...pendingAccept!,
        formIndex: 1,
      }),
    ).toBeNull();
  });
});
