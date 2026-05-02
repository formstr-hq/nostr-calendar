import { describe, expect, it } from "vitest";
import { naddrEncode } from "nostr-tools/nip19";
import {
  buildFormstrResponsesUrl,
  buildFormstrUrl,
  extractNaddr,
  extractViewKey,
  getFormCoordinate,
  getFormRelayHints,
  parseFormInput,
} from "./formLink";

const SAMPLE_PUBKEY = "0".repeat(63) + "1"; // valid 64-char hex
const FORM_KIND = 30168;

const SAMPLE_NADDR = naddrEncode({
  kind: FORM_KIND,
  pubkey: SAMPLE_PUBKEY,
  identifier: "demo-form",
  relays: [],
});

const SAMPLE_VIEW_KEY =
  "4155adc1f08a7c0d425501a407f9e6c4f2babcdf3d002103531cd2f2de26c816";

describe("extractNaddr", () => {
  it("returns the naddr from a bare string", () => {
    expect(extractNaddr(SAMPLE_NADDR)).toBe(SAMPLE_NADDR);
  });

  it("trims whitespace", () => {
    expect(extractNaddr(`  ${SAMPLE_NADDR}  `)).toBe(SAMPLE_NADDR);
  });

  it("extracts naddr embedded in a Formstr URL (path style)", () => {
    expect(extractNaddr(`https://formstr.app/f/${SAMPLE_NADDR}`)).toBe(
      SAMPLE_NADDR,
    );
  });

  it("extracts naddr embedded in a Formstr URL (hash style)", () => {
    expect(
      extractNaddr(`https://formstr.app/#/forms/view/${SAMPLE_NADDR}`),
    ).toBe(SAMPLE_NADDR);
  });

  it("returns null for empty input", () => {
    expect(extractNaddr("")).toBeNull();
    expect(extractNaddr("   ")).toBeNull();
  });

  it("returns null when no naddr is present", () => {
    expect(extractNaddr("https://formstr.app/")).toBeNull();
    expect(extractNaddr("not a form url")).toBeNull();
  });

  it("returns null when the naddr-shaped string fails to decode", () => {
    expect(extractNaddr("naddr1abcdefghijklmnop")).toBeNull();
  });
});

describe("extractViewKey", () => {
  it("returns undefined when there is no view key", () => {
    expect(extractViewKey(SAMPLE_NADDR)).toBeUndefined();
    expect(
      extractViewKey(`https://formstr.app/f/${SAMPLE_NADDR}`),
    ).toBeUndefined();
  });

  it("reads ?viewKey query param (Formstr's canonical share format)", () => {
    expect(
      extractViewKey(
        `https://formstr.app/f/${SAMPLE_NADDR}?viewKey=${SAMPLE_VIEW_KEY}`,
      ),
    ).toBe(SAMPLE_VIEW_KEY);
  });

  it("normalizes ?viewKey query params to lowercase", () => {
    expect(
      extractViewKey(
        `https://formstr.app/f/${SAMPLE_NADDR}?viewKey=${SAMPLE_VIEW_KEY.toUpperCase()}`,
      ),
    ).toBe(SAMPLE_VIEW_KEY);
  });

  it("reads &viewKey when not the first query param", () => {
    expect(
      extractViewKey(
        `https://formstr.app/f/${SAMPLE_NADDR}?foo=bar&viewKey=${SAMPLE_VIEW_KEY}`,
      ),
    ).toBe(SAMPLE_VIEW_KEY);
  });

  it("decodes #nkeys1 hash fragment to viewKey (Formstr's modern format)", async () => {
    // Build a real nkeys blob using the SDK's encoder so the test
    // round-trips through the same TLV path the SDK uses at runtime.
    const { encodeNKeys } = await import(
      "@formstr/sdk/dist/utils/nkeys.js"
    );
    const nkeys = encodeNKeys({ viewKey: SAMPLE_VIEW_KEY });
    expect(
      extractViewKey(`https://formstr.app/f/${SAMPLE_NADDR}#${nkeys}`),
    ).toBe(SAMPLE_VIEW_KEY);
  });

  it("normalizes nkeys-derived view keys to lowercase", async () => {
    const { encodeNKeys } = await import("@formstr/sdk/dist/utils/nkeys.js");
    const nkeys = encodeNKeys({ viewKey: SAMPLE_VIEW_KEY.toUpperCase() });
    expect(
      extractViewKey(`https://formstr.app/f/${SAMPLE_NADDR}#${nkeys}`),
    ).toBe(SAMPLE_VIEW_KEY);
  });

  it("prefers nkeys hash over query params when both are present", async () => {
    const { encodeNKeys } = await import("@formstr/sdk/dist/utils/nkeys.js");
    const hashKey = "a".repeat(64);
    const nkeys = encodeNKeys({ viewKey: hashKey });
    expect(
      extractViewKey(
        `https://formstr.app/f/${SAMPLE_NADDR}?viewKey=should-be-ignored#${nkeys}`,
      ),
    ).toBe(hashKey);
  });

  it("decodes percent-encoded keys", () => {
    expect(
      extractViewKey(
        `https://formstr.app/f/${SAMPLE_NADDR}?viewKey=a%2Fb`,
      ),
    ).toBe("a/b");
  });

  it("ignores responseKey query param (admin secret must not propagate)", () => {
    expect(
      extractViewKey(
        `https://formstr.app/f/${SAMPLE_NADDR}?responseKey=should-be-ignored`,
      ),
    ).toBeUndefined();
  });
});

describe("parseFormInput", () => {
  it("returns canonical attachment for a bare naddr", () => {
    expect(parseFormInput(SAMPLE_NADDR)).toEqual({ naddr: SAMPLE_NADDR });
  });

  it("preserves viewKey when present", () => {
    const parsed = parseFormInput(
      `https://formstr.app/f/${SAMPLE_NADDR}?viewKey=${SAMPLE_VIEW_KEY}`,
    );
    expect(parsed).toEqual({
      naddr: SAMPLE_NADDR,
      viewKey: SAMPLE_VIEW_KEY,
    });
  });

  it("does not propagate responseKey", () => {
    const parsed = parseFormInput(
      `https://formstr.app/f/${SAMPLE_NADDR}?responseKey=admin-secret`,
    );
    expect(parsed).toEqual({ naddr: SAMPLE_NADDR });
  });

  it("returns null for invalid input", () => {
    expect(parseFormInput("nope")).toBeNull();
    expect(parseFormInput("")).toBeNull();
  });
});

describe("buildFormstrUrl", () => {
  it("builds a base URL when no view key", () => {
    expect(buildFormstrUrl({ naddr: SAMPLE_NADDR })).toBe(
      `https://formstr.app/f/${SAMPLE_NADDR}`,
    );
  });

  it("appends viewKey as query param", () => {
    expect(buildFormstrUrl({ naddr: SAMPLE_NADDR, viewKey: "a/b" })).toBe(
      `https://formstr.app/f/${SAMPLE_NADDR}?viewKey=a%2Fb`,
    );
  });
});

describe("buildFormstrResponsesUrl", () => {
  it("builds a Formstr responses URL when no view key", () => {
    expect(buildFormstrResponsesUrl({ naddr: SAMPLE_NADDR })).toBe(
      `https://formstr.app/s/${SAMPLE_NADDR}`,
    );
  });

  it("passes viewKey as ?viewKey= query param", () => {
    expect(
      buildFormstrResponsesUrl({ naddr: SAMPLE_NADDR, viewKey: "a/b" }),
    ).toBe(`https://formstr.app/s/${SAMPLE_NADDR}?viewKey=a%2Fb`);
  });
});

describe("getFormCoordinate", () => {
  it("returns kind:pubkey:dtag for a valid naddr", () => {
    expect(getFormCoordinate(SAMPLE_NADDR)).toBe(
      `${FORM_KIND}:${SAMPLE_PUBKEY}:demo-form`,
    );
  });

  it("returns null for non-naddr input", () => {
    expect(getFormCoordinate("not-an-naddr")).toBeNull();
    expect(getFormCoordinate("")).toBeNull();
  });
});

describe("getFormRelayHints", () => {
  it("returns the embedded relays", () => {
    const naddr = naddrEncode({
      kind: FORM_KIND,
      pubkey: SAMPLE_PUBKEY,
      identifier: "x",
      relays: ["wss://relay.example"],
    });
    expect(getFormRelayHints(naddr)).toEqual(["wss://relay.example"]);
  });

  it("returns empty array when no relays encoded", () => {
    expect(getFormRelayHints(SAMPLE_NADDR)).toEqual([]);
  });

  it("returns empty array for invalid input", () => {
    expect(getFormRelayHints("garbage")).toEqual([]);
  });
});
