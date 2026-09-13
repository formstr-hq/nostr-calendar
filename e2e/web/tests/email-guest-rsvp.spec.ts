import { test, expect, navigate } from "../fixtures/index.js";
import { TEST_KEYS } from "../../relay/seed/keys.js";
import {
  createEventViaDialog,
  openEventModal,
  uniqueName,
  futureDate,
} from "../helpers.js";
import { encodeNKeys } from "@formstr/sdk/dist/utils/nkeys.js";

const GUEST_EMAIL = "friend@gmail.com";
const BRIDGE_PUBKEY = "ab".repeat(32);

// Build the exact `nkeys1…` fragment the organizer's invite link would carry,
// from the secret the organizer actually stored for this guest. Reading it
// back from the host's local store (rather than generating a throwaway key)
// makes these tests exercise the real invariant: the nsec in the link must
// correspond to the guest pubkey written on the event.
async function guestFragmentFromHost(
  host: import("@playwright/test").Page,
  email: string,
) {
  const stored = await host.evaluate(
    ([key, address]) => {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const map = JSON.parse(raw) as Record<string, { pubkey: string; nsec: string }>;
      return map[address.trim().toLowerCase()] ?? null;
    },
    ["cal:email_guest_keys", email] as const,
  );
  if (!stored) throw new Error("Host did not store a guest key");
  return {
    pubkey: stored.pubkey,
    fragment: encodeNKeys({ nsec: stored.nsec, email }),
  };
}

async function interceptMail(page: import("@playwright/test").Page) {
  await page.route(
    "https://mailstr.app/.well-known/nostr.json?*",
    async (route) => {
      const name = new URL(route.request().url()).searchParams.get("name");
      const names: Record<string, string> = {};
      if (name === "_smtp") names._smtp = BRIDGE_PUBKEY;
      if (name === "alice") names.alice = TEST_KEYS.alice.pubkey;
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ names }),
      });
    },
  );
  await page.route("https://api.formstr.app/api/nip-05/get-nip05", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ nip05: "alice", domain: "mailstr.app" }]),
    }),
  );
}

// Create a private event with one email guest; returns the invite naddr path
// plus the event title. `daysAhead` is kept unique from every other spec's
// `futureDate` so parallel tests don't share a day and intercept each other's
// slot clicks.
async function createEmailGuestEvent(
  page: import("@playwright/test").Page,
  daysAhead: number,
) {
  const title = uniqueName("Guest RSVP");
  const date = futureDate(daysAhead);
  await createEventViaDialog(page, {
    date,
    title,
    calendarName: uniqueName("Guest RSVP cal"),
    configure: async (dialog) => {
      await dialog
        .getByRole("combobox", { name: "Search name, NIP-05, npub, or email" })
        .fill(GUEST_EMAIL);
      await page.getByTestId("email-invite-option").click();
      await page.getByTestId("mail-alias-input").fill("alice@mailstr.app");
    },
  });
  const modal = await openEventModal(page, title);
  const href = await modal
    .getByRole("button", { name: "More options" })
    .click()
    .then(() =>
      page
        .getByRole("menuitem", { name: "Open event in new tab" })
        .getAttribute("href"),
    );
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  if (!href) throw new Error("Event link not found");
  return { title, href };
}

test("an email guest can RSVP from their invite link", async ({
  authedPage: host,
  browser,
}) => {
  await interceptMail(host);
  const { title, href } = await createEmailGuestEvent(host, 60);

  // A guest opens the invite link: no account, just the fragment. The secret
  // matches the pubkey the host wrote on the event.
  const guest = await guestFragmentFromHost(host, GUEST_EMAIL);
  const guestUrl = `${href}#${guest.fragment}`;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route(
    "https://mailstr.app/.well-known/nostr.json?*",
    (route) =>
      route.fulfill({ contentType: "application/json", body: '{"names":{}}' }),
  );
  await page.goto(guestUrl);

  await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });
  // The guest gets the RSVP bar, not the login-to-add prompt.
  await expect(page.getByText(`You're responding as ${GUEST_EMAIL}`)).toBeVisible(
    { timeout: 20_000 },
  );
  await page.getByTestId("rsvp-yes").click();

  // The status sticks (replaceable RSVP published under the guest identity).
  await expect(page.getByTestId("rsvp-yes")).toHaveClass(/MuiButton-contained/, {
    timeout: 20_000,
  });

  await context.close();
});

test("host sees the email guest's RSVP labelled by address", async ({
  authedPage: host,
  browser,
}) => {
  await interceptMail(host);
  const { title, href } = await createEmailGuestEvent(host, 61);

  const guest = await guestFragmentFromHost(host, GUEST_EMAIL);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${href}#${guest.fragment}`);
  await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });
  await page.getByTestId("rsvp-yes").click();
  await expect(page.getByTestId("rsvp-yes")).toHaveClass(/MuiButton-contained/, {
    timeout: 20_000,
  });
  await context.close();

  // Host reopens the event standalone and expands participants. The row is
  // labelled with the address, and its status only reads "Yes" because the
  // guest's RSVP actually resolved back to that pubkey.
  await navigate(host, href);
  await expect(host.getByText(title)).toBeVisible({ timeout: 20_000 });
  await host.getByRole("button", { name: "Show participants" }).click();
  const guestRow = host.getByTestId("guest-rsvp-participant");
  await expect(guestRow).toContainText(GUEST_EMAIL, { timeout: 20_000 });
  await expect(guestRow).toContainText("Yes", { timeout: 20_000 });
});
