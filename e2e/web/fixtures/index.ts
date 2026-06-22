import { test as base, type Page, type BrowserContext } from "@playwright/test";
import { TEST_KEYS, TEST_PASSPHRASE } from "../../relay/seed/keys.js";

// ncryptsec accounts prompt for passphrase on every page load / route change.
// Call this whenever the app may have triggered the login dialog.
export async function signIn(page: Page): Promise<void> {
  const dialog = page.getByRole("dialog");
  try {
    await dialog.waitFor({ state: "visible", timeout: 5_000 });

    // First-time login: passphrase field not shown yet — pick "Existing Key" and fill ncryptsec.
    const passphraseField = page.getByLabel("Passphrase");
    if (!await passphraseField.isVisible()) {
      await page.getByRole("button", { name: /Existing Key/ }).click();
      await page.getByLabel("ncryptsec").fill(TEST_KEYS.alice.ncryptsec);
    }

    await passphraseField.fill(TEST_PASSPHRASE);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByTestId("user-avatar").waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    // No login modal — session already active (e.g. extension signer)
  }
}

// Navigate to a URL and handle the passphrase prompt that reappears on each route change.
export async function navigate(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await signIn(page);
}

type Fixtures = {
  // A page already authenticated as Alice, calendar loaded and ready.
  authedPage: Page;
};

export const test = base.extend<Fixtures>({
  authedPage: async ({ browser }, use) => {
    const context: BrowserContext = await browser.newContext();

    const page = await context.newPage();
    await navigate(page, "/");

    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
