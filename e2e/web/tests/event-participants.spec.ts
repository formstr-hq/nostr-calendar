import { TEST_KEYS } from "../../relay/seed/keys.js";
import { test, expect, navigate } from "../fixtures/index.js";
import { createEventViaDialog, openEventEditor } from "../helpers.js";
import { nip19 } from "nostr-tools";

const TEST_DATE = "2027-06-15";
const MISSING_PROFILE_NPUB = nip19.npubEncode("11".repeat(32));

const shortNpub = (npub: string) =>
  `${npub.slice(0, 7)}....${npub.slice(-3)}`;

async function interceptNip05(page: import("@playwright/test").Page) {
  await page.route(
    "https://profiles.test/.well-known/nostr.json?*",
    async (route) => {
      const name = new URL(route.request().url()).searchParams.get("name");
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          names:
            name === "bob"
              ? { bob: TEST_KEYS.bob.pubkey }
              : name === "carol"
                ? { carol: TEST_KEYS.alice.pubkey }
                : {},
        }),
      });
    },
  );
}

test("searches, deduplicates, and persists event participants", async ({
  authedPage: page,
}) => {
  await interceptNip05(page);
  await createEventViaDialog(page, {
    date: TEST_DATE,
    title: "Team Offsite",
    calendarName: "Participants Test Calendar",
  });

  await openEventEditor(page, "Team Offsite");

  const participantInput = page.getByRole("combobox", {
    name: "Search name, NIP-05, or npub",
  });

  // Exact npub lookup still renders the resolved profile row.
  await participantInput.fill(TEST_KEYS.bob.npub);
  await expect(
    page.getByRole("option").filter({
      hasText: shortNpub(TEST_KEYS.bob.npub),
    }),
  ).toBeVisible({ timeout: 1_000 });
  const exactBobOption = page.getByRole("option", { name: /Bob/ });
  await expect(exactBobOption).toBeVisible();
  await expect(exactBobOption).toContainText(shortNpub(TEST_KEYS.bob.npub));
  await expect(exactBobOption.locator(".MuiAvatar-root")).toHaveCSS(
    "border-color",
    "rgba(0, 0, 0, 0)",
  );

  // Exact NIP-05 resolution is fully intercepted and can be selected by Enter.
  await participantInput.fill("bob@profiles.test");
  await expect(
    page.getByRole("option", { name: /Bob bob@profiles\.test/ }),
  ).toBeVisible();
  await participantInput.press("Enter");
  const bobParticipant = page
    .getByRole("listitem")
    .filter({ hasText: "Bob" });
  await expect(bobParticipant).toBeVisible();

  // Selected participants are excluded from all subsequent result sources.
  await participantInput.fill("Bob");
  await expect(page.getByRole("option", { name: /Bob/ })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("No profiles found");

  await participantInput.fill(TEST_KEYS.carol.npub);
  const carolOption = page.getByRole("option", { name: /Carol/ });
  await expect(carolOption).toContainText(shortNpub(TEST_KEYS.carol.npub));
  await expect(carolOption).not.toContainText("carol@profiles.test");
  await carolOption.click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Carol" }),
  ).toBeVisible();

  // A valid npub with no kind-0 metadata also falls back to its npub identity.
  await participantInput.fill(MISSING_PROFILE_NPUB);
  const missingProfileOption = page.getByRole("option").filter({
    hasText: shortNpub(MISSING_PROFILE_NPUB),
  });
  await expect(missingProfileOption).toBeVisible();
  await missingProfileOption.click();
  const missingProfileParticipant = page
    .getByRole("listitem")
    .filter({ hasText: shortNpub(MISSING_PROFILE_NPUB) });
  await expect(missingProfileParticipant).toBeVisible();
  await missingProfileParticipant
    .getByRole("button", { name: "Remove" })
    .click();

  await page.getByRole("button", { name: "Save Event" }).click();
  await expect(page.getByTestId("event-title")).not.toBeVisible({
    timeout: 20_000,
  });

  // Reopen the editor: both participants were persisted.
  await navigate(page, `/d/${TEST_DATE.replaceAll("-", "/")}`);
  await openEventEditor(page, "Team Offsite");
  await expect(
    page.getByRole("listitem").filter({ hasText: "Bob" }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Carol" }),
  ).toBeVisible();

  // Remove Bob, keep Carol, and persist the removal.
  await bobParticipant.getByRole("button", { name: "Remove" }).click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Bob" }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Save Event" }).click();
  await expect(page.getByTestId("event-title")).not.toBeVisible({
    timeout: 20_000,
  });

  // Reopen once more: only Carol remains.
  await navigate(page, `/d/${TEST_DATE.replaceAll("-", "/")}`);
  await openEventEditor(page, "Team Offsite");
  await expect(
    page.getByRole("listitem").filter({ hasText: "Carol" }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Bob" }),
  ).not.toBeVisible();

  // Bob remains in local history. Empty focus and a local name match both
  // expose the prior-contact avatar border after the saved event interaction.
  const reopenedInput = page.getByRole("combobox", {
    name: "Search name, NIP-05, or npub",
  });
  await reopenedInput.focus();
  let priorBob = page.getByRole("option", { name: /Bob/ });
  await expect(priorBob).toBeVisible();
  const textColor = await page.locator("body").evaluate((body) =>
    getComputedStyle(body).color,
  );
  await expect(priorBob.locator(".MuiAvatar-root")).toHaveCSS(
    "border-color",
    textColor,
  );
  await priorBob.hover();
  await expect(
    page
      .getByRole("tooltip")
      .filter({ hasText: "You have shared an event with this person" }),
  ).toBeVisible();
  await reopenedInput.fill("Bob");
  priorBob = page.getByRole("option", { name: /Bob/ });
  await expect(priorBob).toBeVisible();
  await expect(priorBob).toContainText(shortNpub(TEST_KEYS.bob.npub));
  await expect(priorBob.locator(".MuiAvatar-root")).toHaveCSS(
    "border-color",
    textColor,
  );
});

test("discards a stale NIP-05 result after the query changes", async ({
  authedPage: page,
}) => {
  let releaseResolution!: () => void;
  const resolutionGate = new Promise<void>((resolve) => {
    releaseResolution = resolve;
  });
  let requestStarted!: () => void;
  const requestSeen = new Promise<void>((resolve) => {
    requestStarted = resolve;
  });

  await page.route("https://profiles.test/.well-known/nostr.json?*", (route) =>
    route.fulfill({ contentType: "application/json", body: '{"names":{}}' }),
  );
  // Playwright evaluates the most recently registered matching route first.
  await page.route(
    "https://profiles.test/.well-known/nostr.json?name=slow",
    async (route) => {
      requestStarted();
      await resolutionGate;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ names: { slow: TEST_KEYS.bob.pubkey } }),
      });
    },
  );

  await createEventViaDialog(page, {
    date: "2027-06-16",
    title: "Stale Search Event",
    calendarName: "Stale Participants Calendar",
  });
  await openEventEditor(page, "Stale Search Event");

  const participantInput = page.getByRole("combobox", {
    name: "Search name, NIP-05, or npub",
  });
  await participantInput.fill("slow@profiles.test");
  await requestSeen;
  await participantInput.fill(TEST_KEYS.carol.npub);
  await expect(page.getByRole("option", { name: /Carol/ })).toBeVisible();
  releaseResolution();
  await expect(page.getByRole("option", { name: /Bob/ })).toHaveCount(0);
  await expect(participantInput).toHaveValue(TEST_KEYS.carol.npub);
});
