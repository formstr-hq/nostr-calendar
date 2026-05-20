import { describe, expect, it } from "vitest";
import { relayPublishFeedbackMessage } from "../utils/relayFeedback";

describe("relayPublishFeedbackMessage", () => {
  it("uses relay OK reasons when present", () => {
    expect(relayPublishFeedbackMessage("duplicate: already have it")).toBe(
      "duplicate: already have it",
    );
  });

  it("uses error messages for relay failures", () => {
    expect(relayPublishFeedbackMessage(new Error("blocked: restricted"))).toBe(
      "blocked: restricted",
    );
  });

  it("falls back for missing relay feedback", () => {
    expect(relayPublishFeedbackMessage(undefined)).toBe(
      "No relay feedback provided",
    );
  });
});
