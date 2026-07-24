import { test, expect, signIn, injectAuth } from "../fixtures/index.js";
import { TEST_KEYS } from "../../relay/seed/keys.js";

// Auth flows drive the real login modal, so none of these use the fast-auth
// fixtures (except where noted).

test("login modal opens automatically for logged-out visitors", async ({
  page,
}) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Sign in to Calendar")).toBeVisible();
  // Routes are gated on login — no calendar grid is rendered.
  await expect(page.getByTestId("day-hour-cell")).toHaveCount(0);
});

test("user logs in with an existing ncryptsec key", async ({ page }) => {
  await page.goto("/");
  await signIn(page, TEST_KEYS.alice);
  await expect(page.getByTestId("user-avatar")).toBeVisible();

  // The session persists across a reload — only the passphrase is asked for.
  await page.reload();
  await signIn(page, TEST_KEYS.alice);
  await expect(page.getByTestId("user-avatar")).toBeVisible();
});

test("user creates a new account with key backup", async ({ browser }) => {
  // navigator.clipboard.writeText needs explicit permission in headless runs.
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  await page.goto("/");

  await page.getByRole("button", { name: /Create Account/ }).click();
  const dialog = page.getByRole("dialog").filter({ hasText: "Create Account" });
  await dialog.getByLabel("Name").fill("E2E New User");
  await dialog.getByLabel("Passphrase", { exact: true }).fill("new-user-pass");
  await dialog.getByLabel("Confirm Passphrase").fill("new-user-pass");
  await dialog.getByRole("button", { name: "Create", exact: true }).click();

  // Backup step: acknowledging is gated on actually copying the key.
  await expect(page.getByText("Back up your key")).toBeVisible();
  const acknowledge = page.getByRole("button", { name: "I've saved it" });
  await expect(acknowledge).toBeDisabled();
  await page.getByRole("button", { name: "Copy ncryptsec" }).click();
  await expect(acknowledge).toBeEnabled();
  await acknowledge.click();

  await expect(page.getByTestId("user-avatar")).toBeVisible();
  await context.close();
});

test("ncryptsec keys can be downloaded and uploaded as key.txt", async ({
  browser,
}) => {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.goto("/");

  await page.getByRole("button", { name: /Create Account/ }).click();
  await page.getByLabel("Passphrase", { exact: true }).fill("download-pass");
  await page.getByLabel("Confirm Passphrase").fill("download-pass");
  await page.getByRole("button", { name: "Create", exact: true }).click();

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("login-download-key").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("key.txt");

  await page.getByRole("button", { name: "I've saved it" }).click();
  await page.getByTestId("user-avatar").click();
  await page.getByRole("menuitem", { name: /Log Out/ }).click();
  await page.getByRole("button", { name: "Existing Key" }).click();
  await page.getByTestId("login-upload-key-input").setInputFiles({
    name: "key.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      await download.createReadStream().then(async (stream) => {
        const parts: Buffer[] = [];
        for await (const part of stream!) parts.push(part as Buffer);
        return Buffer.concat(parts);
      }),
    ),
  });
  await expect(page.getByTestId("login-input-ncryptsec")).not.toHaveValue("");
  await context.close();
});

test("user logs out from the user menu", async ({ authedPage: page }) => {
  await page.getByTestId("user-avatar").click();
  await page.getByRole("menuitem", { name: /Log Out/ }).click();

  // Logged out again: the login modal auto-opens and the grid is gone.
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("Sign in to Calendar")).toBeVisible();
});

test("user copies their npub from the user menu", async ({ browser }) => {
  const context = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await injectAuth(context, TEST_KEYS.alice, "Alice");
  const page = await context.newPage();
  await page.goto("/");

  await page.getByTestId("user-avatar").click();
  await page.getByRole("menuitem", { name: "Copy Identity (NPUB)" }).click();

  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(TEST_KEYS.alice.npub);
  await context.close();
});
