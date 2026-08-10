import { test, expect } from "../fixtures/index.js";
import { SimplePool } from "nostr-tools/pool";
import { TEST_KEYS } from "../../relay/seed/keys.js";
import { testRelayUrl } from "../../relay/seed/publish.js";

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

test("user adds and removes a relay in the list", async ({
  authedPage: page,
}) => {
  const panel = await openRelayManager(page);
  const url = "wss://relay.example-e2e.com";

  await panel.getByPlaceholder("wss://relay.example.com").fill(url);
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  const entry = panel.getByTestId("relay-row").filter({ hasText: url });
  await expect(entry).toBeVisible();

  // Duplicates are rejected.
  await panel.getByPlaceholder("wss://relay.example.com").fill(url);
  await panel.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Relay already in list")).toBeVisible();
  await expect(entry).toHaveCount(1);

  await entry.getByRole("button", { name: "remove relay" }).click();
  await expect(entry).not.toBeVisible();
});

test("relay URLs must be websocket URLs", async ({ authedPage: page }) => {
  const panel = await openRelayManager(page);

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
