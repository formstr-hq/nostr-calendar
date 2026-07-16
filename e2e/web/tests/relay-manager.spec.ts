import { test, expect } from "../fixtures/index.js";

// All list edits happen on local state until "Save" — the tests below cancel
// out unless explicitly testing save, so the app keeps talking to the test
// relay in other (parallel) tests' contexts.

async function openRelayManager(page: import("@playwright/test").Page) {
  await page.getByTestId("user-avatar").last().click();
  await page.getByRole("menuitem", { name: "Relays" }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Manage Relays" });
  await expect(dialog).toBeVisible();
  return dialog;
}

test("user adds and removes a relay in the list", async ({
  authedPage: page,
}) => {
  const dialog = await openRelayManager(page);
  const url = "wss://relay.example-e2e.com";

  await dialog.getByPlaceholder("wss://relay.example.com").fill(url);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  const entry = dialog.getByRole("listitem").filter({ hasText: url });
  await expect(entry).toBeVisible();

  // Duplicates are rejected.
  await dialog.getByPlaceholder("wss://relay.example.com").fill(url);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Relay already in list")).toBeVisible();
  await expect(entry).toHaveCount(1);

  await entry.getByRole("button", { name: "remove relay" }).click();
  await expect(entry).not.toBeVisible();

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).not.toBeVisible();
});

test("relay URLs must be websocket URLs", async ({ authedPage: page }) => {
  const dialog = await openRelayManager(page);

  await dialog
    .getByPlaceholder("wss://relay.example.com")
    .fill("https://not-a-relay.com");
  await dialog.getByRole("button", { name: "Add", exact: true }).click();

  await expect(
    page.getByText("Relay URL must start with wss:// or ws://"),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("reset to defaults repopulates the relay list", async ({
  authedPage: page,
}) => {
  const dialog = await openRelayManager(page);

  // Remove every relay, then reset.
  const removeButtons = dialog.getByRole("button", { name: "remove relay" });
  while ((await removeButtons.count()) > 0) {
    await removeButtons.first().click();
  }
  await expect(page.getByText("No relays configured", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save" })).toBeDisabled();

  await dialog.getByRole("button", { name: "Reset to Defaults" }).click();
  expect(await dialog.getByRole("listitem").count()).toBeGreaterThan(0);

  await dialog.getByRole("button", { name: "Cancel" }).click();
});

test("saving publishes the relay list", async ({ authedPage: page }) => {
  const dialog = await openRelayManager(page);

  // Save the list unchanged (still pointing at the test relay) — this
  // exercises the NIP-65 publish path without repointing the app.
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Relay list saved and published")).toBeVisible({
    timeout: 20_000,
  });
  await expect(dialog).not.toBeVisible();
});
