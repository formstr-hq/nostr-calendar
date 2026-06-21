import { test as base, type Page, type BrowserContext } from "@playwright/test";
import path from "path";
import { TEST_KEYS } from "../../relay/seed/keys.js";

const AUTH_STATE_PATH = path.resolve(import.meta.dirname, "../../../.auth/alice.json");

type Fixtures = {
  // A page already authenticated as Alice, calendar loaded and ready.
  authedPage: Page;
};

export const test = base.extend<Fixtures>({
  authedPage: async ({ browser }, use) => {
    // storageState restores localStorage (including calendar:keys for Alice).
    // The app's restoreFromStorage() picks it up and creates a LocalSigner
    // without any login flow.
    const context: BrowserContext = await browser.newContext({
      storageState: AUTH_STATE_PATH,
    });

    // Re-inject the init script so that any subsequent navigations within
    // the test also get Alice's keys in localStorage (covers page.reload()).
    await context.addInitScript(
      ({ keysKey, cacheKey, secret, pubkey }) => {
        if (!localStorage.getItem(keysKey)) {
          localStorage.setItem(keysKey, JSON.stringify({ pubkey, secret }));
        }
        if (!localStorage.getItem(cacheKey)) {
          localStorage.setItem(cacheKey, JSON.stringify({ pubkey, name: "Alice Test" }));
        }
      },
      {
        keysKey: "calendar:keys",
        cacheKey: "calendar:userData",
        secret: TEST_KEYS.alice.secretHex,
        pubkey: TEST_KEYS.alice.pubkey,
      },
    );

    const page = await context.newPage();
    await page.goto("/");
    await page.getByTestId("user-avatar").waitFor({ state: "visible", timeout: 10_000 });

    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
