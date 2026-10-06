import { test, expect, injectAuth } from "../fixtures/index.js";
import { createMockRelay } from "nostr-mock-relay";
import { getPublicKey } from "nostr-tools";
import { SimplePool } from "nostr-tools/pool";
import { TEST_KEYS } from "../../relay/seed/keys.js";
import { testRelayUrl } from "../../relay/seed/publish.js";
import { createEventViaDialog } from "../helpers.js";

const RELAY_TEST_SECRET_HEX =
  "dddd0000dddd0000dddd0000dddd0000dddd0000dddd0000dddd0000dddd0004";
const RELAY_TEST_KEY = {
  secretHex: RELAY_TEST_SECRET_HEX,
  pubkey: getPublicKey(
    Uint8Array.from(Buffer.from(RELAY_TEST_SECRET_HEX, "hex")),
  ),
};
const PRIVATE_CALENDAR_EVENT_KIND = 32678;

// All list edits happen on local state until "Save" — the tests below cancel
// out unless explicitly testing save, so the app keeps talking to the test
// relay in other (parallel) tests' contexts.

async function openRelayManager(page: import("@playwright/test").Page) {
  await page.getByTestId("user-avatar").last().click();
  await page.getByRole("menuitem", { name: "Relays" }).click();
  await expect(page).toHaveURL(/\/settings\/relays$/);
  const panel = page.getByRole("main");
  await expect(
    panel.getByRole("heading", { name: "Relays & sync" }),
  ).toBeVisible();
  return panel;
}

test("header relay status opens the relay manager dialog", async ({
  authedPage: page,
}) => {
  await page.getByRole("button", { name: "Manage Relays" }).click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: /Manage Relays|Relays & sync/i }),
  ).toBeVisible();
  await expect(dialog.getByTestId("relay-row").first()).toBeVisible();
  await expect(page).not.toHaveURL(/\/settings\/relays$/);

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).not.toBeVisible();
});

test("user adds and removes a relay in the list", async ({
  authedPage: page,
}) => {
  const panel = await openRelayManager(page);
  const url = "wss://relay.example-e2e.com";

  await panel.getByRole("button", { name: "Add New Relay" }).click();
  await panel.getByPlaceholder("wss://relay.example.com").fill(url);
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  const entry = panel.getByTestId("relay-row").filter({ hasText: url });
  await expect(entry).toBeVisible();

  // Duplicates are rejected.
  await panel.getByRole("button", { name: "Add New Relay" }).click();
  await panel.getByPlaceholder("wss://relay.example.com").fill(url);
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Relay already in list")).toBeVisible();
  await expect(entry).toHaveCount(1);

  await entry.getByRole("button", { name: "remove relay" }).click();
  await expect(entry).not.toBeVisible();
});

test("relay URLs must be websocket URLs", async ({ authedPage: page }) => {
  const panel = await openRelayManager(page);

  await panel.getByRole("button", { name: "Add New Relay" }).click();
  await panel
    .getByPlaceholder("wss://relay.example.com")
    .fill("https://not-a-relay.com");
  await panel.getByRole("button", { name: "Add", exact: true }).click();

  await expect(
    page.getByText("Relay URL must start with wss:// or ws://"),
  ).toBeVisible();
});

test("reset to defaults repopulates the relay list", async ({
  authedPage: page,
}) => {
  const panel = await openRelayManager(page);

  // Remove every relay, then reset.
  const removeButtons = panel.getByRole("button", { name: "remove relay" });
  while ((await removeButtons.count()) > 0) {
    await removeButtons.first().click();
  }
  await expect(
    page.getByText("No relays configured", { exact: false }),
  ).toBeVisible();
  await expect(panel.getByRole("button", { name: "Save" })).toBeDisabled();

  await panel.getByRole("button", { name: "Reset to Defaults" }).click();
  expect(await panel.getByTestId("relay-row").count()).toBeGreaterThan(0);
});

test("saving publishes the relay list", async ({ authedPage: page }) => {
  const panel = await openRelayManager(page);
  const relayUrl = testRelayUrl();

  // Save the list unchanged (still pointing at the test relay) — this
  // exercises the NIP-65 publish path without repointing the app.
  await panel.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Relay list saved and published")).toBeVisible({
    timeout: 20_000,
  });

  const pool = new SimplePool();
  try {
    await expect
      .poll(
        async () => {
          const events = await pool.querySync([relayUrl], {
            kinds: [10002],
            authors: [TEST_KEYS.alice.pubkey],
          });
          return events
            .at(0)
            ?.tags.filter(([name]) => name === "r")
            .map(([, url]) => url);
        },
        {
          message: `expected Alice's relay list on ${relayUrl}`,
          timeout: 20_000,
        },
      )
      .toContain(relayUrl);
  } finally {
    pool.close([relayUrl]);
  }
});

test("publishes events to a newly added relay", async ({ browser }) => {
  const relay = createMockRelay({ host: "127.0.0.1", port: 0 });
  await relay.start();

  try {
    if (!relay.url) throw new Error("Secondary mock relay did not start");
    const relayUrl = relay.url;
    const context = await browser.newContext();

    try {
      await injectAuth(context, RELAY_TEST_KEY, "Relay Test User");

      const page = await context.newPage();
      await page.goto("/");
      await page
        .getByTestId("user-avatar")
        .last()
        .waitFor({ state: "visible", timeout: 15_000 });

      const panel = await openRelayManager(page);
      await panel.getByRole("button", { name: "Add New Relay" }).click();
      await panel.getByPlaceholder("wss://relay.example.com").fill(relayUrl);
      await panel.getByRole("button", { name: "Add", exact: true }).click();
      await expect(
        panel.getByTestId("relay-row").filter({ hasText: relayUrl }),
      ).toBeVisible();
      await panel.getByRole("button", { name: "Save", exact: true }).click();

      await expect
        .poll(
          () =>
            relay
              .getEvents()
              .find(
                (event) =>
                  event.kind === 10002 &&
                  event.pubkey === RELAY_TEST_KEY.pubkey,
              )
              ?.tags.filter(([name]) => name === "r")
              .map(([, url]) => url),
          {
            message: `expected relay list on newly added relay ${relayUrl}`,
            timeout: 20_000,
          },
        )
        .toContain(relayUrl);

      await createEventViaDialog(page, {
        date: "2027-08-20",
        title: "Secondary Relay Event",
        calendarName: "Secondary Relay Calendar",
      });

      await expect
        .poll(
          () =>
            relay
              .getEvents()
              .some(
                (event) =>
                  event.kind === PRIVATE_CALENDAR_EVENT_KIND &&
                  event.pubkey === RELAY_TEST_KEY.pubkey,
              ),
          {
            message: `expected private calendar event on ${relayUrl}`,
            timeout: 20_000,
          },
        )
        .toBe(true);
    } finally {
      await context.close();
    }
  } finally {
    await relay.stop();
  }
});

test("tests individual relay connection and updates status indicator", async ({
  authedPage: page,
}) => {
  const panel = await openRelayManager(page);
  const row = panel.getByTestId("relay-row").first();
  await expect(row).toBeVisible();

  // Each row has a status indicator dot
  const indicator = row.getByTestId("relay-status-indicator");
  await expect(indicator).toBeVisible();

  // Click individual test button
  const testButton = row.getByTestId("test-relay-button");
  await expect(testButton).toBeVisible();
  await testButton.click();

  // Expect indicator to show status (ok/slow/error)
  await expect(indicator).toHaveAttribute("data-status", /ok|slow|error|testing/);
});

test("test all connections button triggers tests for all relays", async ({
  authedPage: page,
}) => {
  const panel = await openRelayManager(page);
  const testAllBtn = panel.getByTestId("test-all-connections-button");
  await expect(testAllBtn).toBeVisible();
  await testAllBtn.click();

  const rows = panel.getByTestId("relay-row");
  const count = await rows.count();
  expect(count).toBeGreaterThan(0);

  // All rows should have status indicators
  for (let i = 0; i < count; i++) {
    const row = rows.nth(i);
    await expect(row.getByTestId("relay-status-indicator")).toBeVisible();
  }
});

test("user edits a relay URL in the list", async ({ authedPage: page }) => {
  const panel = await openRelayManager(page);
  const url = "wss://relay.edit-test.com";

  await panel.getByRole("button", { name: "Add New Relay" }).click();
  await panel.getByPlaceholder("wss://relay.example.com").fill(url);
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  const entry = panel.locator(`[data-testid="relay-row"][data-relay="${url}"]`);
  await expect(entry).toBeVisible();

  // Click edit button
  await entry.getByTestId("edit-relay-button").click();
  const editInput = entry.getByRole("textbox");
  await expect(editInput).toHaveValue(url);

  const updatedUrl = "wss://relay.edited-target.com";
  await editInput.fill(updatedUrl);
  await entry.getByRole("button", { name: "save relay edit" }).click();

  // Old URL should no longer be in the list, new URL should be present
  await expect(
    panel.locator(`[data-testid="relay-row"][data-relay="${url}"]`),
  ).not.toBeVisible();
  const updatedEntry = panel.locator(
    `[data-testid="relay-row"][data-relay="${updatedUrl}"]`,
  );
  await expect(updatedEntry).toBeVisible();

  // Clean up
  await updatedEntry.getByRole("button", { name: "remove relay" }).click();
  await expect(updatedEntry).not.toBeVisible();
});

