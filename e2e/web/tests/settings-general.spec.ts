import { bytesToHex } from "@noble/hashes/utils.js";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import { test, expect, injectAuth } from "../fixtures/index.js";

test("general settings persist and affect calendar defaults", async ({
  browser,
}) => {
  const secretKey = generateSecretKey();
  const context = await browser.newContext();
  await injectAuth(
    context,
    {
      pubkey: getPublicKey(secretKey),
      secretHex: bytesToHex(secretKey),
    },
    "Settings User",
  );
  const page = await context.newPage();
  await page.goto("/settings/general");
  await expect(page.getByTestId("user-avatar")).toBeVisible();

  await page.getByLabel("Start week on").click();
  await page.getByRole("option", { name: "Saturday" }).click();
  await page.getByLabel("Time format").click();
  await page.getByRole("option", { name: "12-hour" }).click();
  await page.getByLabel("Default duration").click();
  await page.getByRole("option", { name: "25 min" }).click();
  await page.getByLabel("Default reminder").click();
  await page.getByRole("option", { name: "15 min" }).click();

  // Each change is serialized through the NIP-78 publish queue.
  await page.waitForTimeout(1_000);
  await page.reload();
  await expect(page.getByLabel("Start week on")).toHaveText(/Saturday/);
  await expect(page.getByLabel("Time format")).toHaveText(/12-hour/);
  await expect(page.getByLabel("Default duration")).toHaveText(/25 min/);
  await expect(page.getByLabel("Default reminder")).toHaveText(/15 min/);

  await page.goto("/d/2027/1/15");
  await expect(page.getByText("12 AM", { exact: true })).toBeVisible();
  await page.locator('[data-date="2027-01-15"]').nth(10).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("event-start-time")).toHaveValue(/10:30 AM/);
  await expect(dialog.getByTestId("event-end-time")).toHaveValue(/10:55 AM/);
  await context.close();
});
