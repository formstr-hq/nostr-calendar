import {
  expect,
  test as base,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import {
  TEST_KEYS,
  TEST_PASSPHRASE,
  type TestKey,
} from "../../relay/seed/keys.js";

// ─── Fast auth (default) ─────────────────────────────────────────────────────
//
// The signer has a legacy guest-key restore path that reads
// localStorage["calendar:keys"] = { pubkey, secret } and creates a LocalSigner
// with no login UI (src/common/signer/index.ts, tryLegacyRestore). Injecting it
// before the app loads skips the login modal AND the per-navigation passphrase
// prompt that ncryptsec accounts trigger. Modal-driven login is still covered
// explicitly in auth.spec.ts.
export async function injectAuth(
  context: BrowserContext,
  key: Pick<TestKey, "pubkey" | "secretHex"> = TEST_KEYS.alice,
  name?: string,
): Promise<void> {
  await context.addInitScript(
    ([pubkey, secret, userName]) => {
      window.localStorage.setItem(
        "calendar:keys",
        JSON.stringify({ pubkey, secret }),
      );
      // Cached profile — without it the signer restores the key but leaves
      // `user` unset, and the app keeps showing the login modal.
      window.localStorage.setItem(
        "calendar:userData",
        JSON.stringify({ pubkey, name: userName }),
      );
    },
    [key.pubkey, key.secretHex, name ?? "Test User"] as const,
  );
}

// ─── Modal login (auth.spec.ts and ncryptsec-specific flows) ────────────────
//
// ncryptsec accounts prompt for passphrase on every page load / route change.
// Call this whenever the app may have triggered the login dialog.
// `key` only matters on the very first login in a context — after that the
// stored ncryptsec is reused and only the passphrase is asked for.
export async function signIn(
  page: Page,
  key: TestKey = TEST_KEYS.alice,
): Promise<void> {
  // Booking/event pages render their own <Header/> on top of the app-level
  // one, so there can be two avatars — .last() is the clickable one.
  const avatar = page.getByTestId("user-avatar").last();
  const dialog = page.getByRole("dialog");

  // Fast-authed contexts never show the dialog — don't burn 5s waiting for it.
  await Promise.race([
    avatar.waitFor({ state: "visible", timeout: 10_000 }),
    dialog.waitFor({ state: "visible", timeout: 10_000 }),
  ]).catch(() => {});
  if (await avatar.isVisible()) return;

  await expect(dialog).toBeVisible();
  const ncryptsecField = dialog.getByTestId("login-input-ncryptsec");
  if (!(await ncryptsecField.isVisible())) {
    await dialog.getByRole("button", { name: /Existing Key/ }).click();
  }
  await expect(ncryptsecField).toBeVisible();
  if (!(await ncryptsecField.inputValue())) {
    await ncryptsecField.fill(key.ncryptsec);
  }

  await dialog.getByLabel("Passphrase", { exact: true }).fill(TEST_PASSPHRASE);
  const signInButton = dialog.getByRole("button", {
    name: /^(Sign in|Log In)$/,
  });
  await expect(signInButton).toBeEnabled();
  await signInButton.click();
  await avatar.waitFor({ state: "visible", timeout: 10_000 });
}

// Navigate to a URL and handle the passphrase prompt that reappears on each
// route change (a no-op for fast-authed contexts).
export async function navigate(
  page: Page,
  url: string,
  key: TestKey = TEST_KEYS.alice,
): Promise<void> {
  await page.goto(url);
  await signIn(page, key);
}

type Fixtures = {
  // A page already authenticated as Alice (fast key injection), calendar ready.
  authedPage: Page;
  // A second, independent browser context authenticated as Bob.
  bobPage: Page;
  // A third context authenticated as Carol.
  carolPage: Page;
};

async function fastAuthedPage(
  browser: import("@playwright/test").Browser,
  key: TestKey,
  name: string,
): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext();
  await injectAuth(context, key, name);
  const page = await context.newPage();
  await page.goto("/");
  await page
    .getByTestId("user-avatar")
    .waitFor({ state: "visible", timeout: 15_000 });
  return { page, context };
}

export const test = base.extend<Fixtures>({
  authedPage: async ({ browser }, use) => {
    const { page, context } = await fastAuthedPage(
      browser,
      TEST_KEYS.alice,
      "Alice",
    );
    await use(page);
    await context.close();
  },

  bobPage: async ({ browser }, use) => {
    const { page, context } = await fastAuthedPage(
      browser,
      TEST_KEYS.bob,
      "Bob",
    );
    await use(page);
    await context.close();
  },

  carolPage: async ({ browser }, use) => {
    const { page, context } = await fastAuthedPage(
      browser,
      TEST_KEYS.carol,
      "Carol",
    );
    await use(page);
    await context.close();
  },
});

export { expect } from "@playwright/test";
