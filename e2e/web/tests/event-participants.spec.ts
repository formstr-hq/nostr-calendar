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

  // With no query, named contacts are promoted above unnamed pubkeys while
  // retaining contact-list order within the named group.
  await participantInput.focus();
  const defaultOptions = page.getByRole("option");
  await expect(defaultOptions.nth(0)).toContainText("Bob");
  await expect(defaultOptions.nth(1)).toContainText("Carol");
  await expect(defaultOptions.nth(2)).toContainText(
    shortNpub(MISSING_PROFILE_NPUB),
  );

  // Exact npub lookup still renders the resolved profile row.
  await participantInput.fill(TEST_KEYS.bob.npub);
  await expect(
    page.getByRole("option").filter({
      hasText: shortNpub(TEST_KEYS.bob.npub),
    }),
  ).toBeVisible({ timeout: 1_000 });
  const exactBobOption = page.getByRole("option", { name: /Bob/ });
  await expect(exactBobOption).toBeVisible();
  await expect(exactBobOption).toHaveCount(1);
  await expect(exactBobOption).toContainText(shortNpub(TEST_KEYS.bob.npub));
  await expect(
    exactBobOption.getByTestId("participant-contact-icon"),
  ).toBeVisible();
  await expect(exactBobOption.getByTestId("participant-event-icon")).toHaveCount(
    0,
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

  // Matching selected participants remain visible after selectable results.
  await participantInput.fill("o");
  await expect(page.getByRole("option").first()).toContainText("Carol");
  const selectedBobOption = page.getByRole("option").last();
  await expect(selectedBobOption).toContainText("Bob");
  await expect(selectedBobOption).toBeDisabled();

  await participantInput.fill("Bob");
  await expect(page.getByRole("option", { name: /Bob/ })).toBeDisabled();

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

  // Bob remains in local history and is also in Alice's contact list. The
  // merged row is deduplicated and exposes both provenance icons.
  const reopenedInput = page.getByRole("combobox", {
    name: "Search name, NIP-05, or npub",
  });
  await reopenedInput.focus();
  let priorBob = page.getByRole("option", { name: /Bob/ });
  await expect(priorBob).toBeVisible();
  await expect(priorBob).toHaveCount(1);
  await expect(priorBob.getByTestId("participant-event-icon")).toBeVisible();
  await expect(priorBob.getByTestId("participant-contact-icon")).toBeVisible();
  await priorBob.hover();
  await expect(
    page.getByRole("tooltip").filter({
      hasText: "You have shared an event with this person",
    }),
  ).toHaveCount(0);

  // Carol is already a participant on this event. With an empty query she
  // still appears (not filtered out), but pinned to the end, disabled, and
  // labelled distinctly from the selectable suggestions above her.
  const defaultOptionsAfterReopen = page.getByRole("option");
  await expect(defaultOptionsAfterReopen.last()).toContainText("Carol");
  const carolAlreadyInEvent = page.getByRole("option", { name: /Carol/ });
  await expect(carolAlreadyInEvent).toBeDisabled();
  await expect(carolAlreadyInEvent).toContainText("Already in the event");
  await expect(priorBob).not.toBeDisabled();

  await reopenedInput.fill("Bob");
  priorBob = page.getByRole("option", { name: /Bob/ });
  await expect(priorBob).toHaveCount(1);
  await expect(priorBob).toContainText(shortNpub(TEST_KEYS.bob.npub));
  await expect(priorBob.getByTestId("participant-event-icon")).toBeVisible();
  await expect(priorBob.getByTestId("participant-contact-icon")).toBeVisible();
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
