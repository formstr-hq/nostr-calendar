import { TEST_KEYS } from "../../relay/seed/keys.js";
import { test, expect, navigate } from "../fixtures/index.js";
import { createEventViaDialog, openEventEditor } from "../helpers.js";

const TEST_DATE = "2027-06-20";
const BRIDGE_PUBKEY = "ab".repeat(32);

// The email-guest flow discovers the bridge and proves From-address ownership
// over NIP-05 (`_smtp@<domain>` and `<alias>@<domain>`). It also asks the
// Formstr account API which aliases the npub owns; intercept both so the test
// is hermetic and the "no alias" state is deterministic.
async function interceptMailNip05(
  page: import("@playwright/test").Page,
  { ownedAliases = [] as string[] } = {},
) {
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
  // Account-API alias lookup: 404 means "owns none" (authoritative negative,
  // which is what surfaces the gated notice); a populated array means owned.
  await page.route("https://api.formstr.app/api/nip-05/get-nip05", (route) =>
    route.fulfill({
      status: ownedAliases.length ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify(ownedAliases),
    }),
  );
}

test("invites an external guest by email and persists the guest", async ({
  authedPage: page,
}) => {
  await interceptMailNip05(page, { ownedAliases: ["alice@mailstr.app"] });

  await createEventViaDialog(page, {
    date: TEST_DATE,
    title: "Email Guest Offsite",
    calendarName: "Email Guest Calendar",
  });
  await openEventEditor(page, "Email Guest Offsite");

  const participantInput = page.getByRole("combobox", {
    name: "Search name, NIP-05, npub, or email",
  });

  // A plain email with no Nostr match surfaces the invite-by-email row.
  await participantInput.fill("friend@gmail.com");
  const emailOption = page.getByTestId("email-invite-option");
  await expect(emailOption).toBeVisible();
  await expect(emailOption).toContainText("Invite friend@gmail.com");
  await emailOption.click();

  // The guest list shows the email guest distinctly, plus the From picker.
  const emailGuest = page.getByTestId("email-guest-row");
  await expect(emailGuest).toBeVisible();
  await expect(emailGuest).toContainText("friend@gmail.com");
  await expect(page.getByTestId("mail-alias-picker")).toBeVisible();
  // The account already owns an alias, so the gated notice must NOT appear.
  await expect(page.getByTestId("mail-alias-notice")).toHaveCount(0);
  await expect(page.getByTestId("mail-alias-input")).toHaveValue(
    "alice@mailstr.app",
  );

  await page.getByRole("button", { name: "Save Event" }).click();
  await expect(page.getByTestId("event-title")).not.toBeVisible({
    timeout: 20_000,
  });

  // Reopen: the email guest persisted on the event.
  await navigate(page, `/d/${TEST_DATE.replaceAll("-", "/")}`);
  await openEventEditor(page, "Email Guest Offsite");
  await expect(page.getByTestId("email-guest-row")).toContainText(
    "friend@gmail.com",
  );

  // Removing the email guest persists too.
  await page.getByTestId("email-guest-row").getByRole("button", {
    name: "Remove",
  }).click();
  await expect(page.getByTestId("email-guest-row")).toHaveCount(0);

  await page.getByRole("button", { name: "Save Event" }).click();
  await expect(page.getByTestId("event-title")).not.toBeVisible({
    timeout: 20_000,
  });

  await navigate(page, `/d/${TEST_DATE.replaceAll("-", "/")}`);
  await openEventEditor(page, "Email Guest Offsite");
  await expect(page.getByTestId("email-guest-row")).toHaveCount(0);
});

test("blocks the email invite with a clear error when no mail address is set", async ({
  authedPage: page,
}) => {
  await interceptMailNip05(page);

  await createEventViaDialog(page, {
    date: "2027-06-21",
    title: "No Alias Email Event",
    calendarName: "No Alias Calendar",
  });
  await openEventEditor(page, "No Alias Email Event");

  const participantInput = page.getByRole("combobox", {
    name: "Search name, NIP-05, npub, or email",
  });
  await participantInput.fill("guest@example.com");
  await page.getByTestId("email-invite-option").click();

  // No alias configured yet: the gated notice is shown.
  await expect(page.getByTestId("mail-alias-notice")).toBeVisible();

  // Saving without an alias fails with the ownership/bridge error rather than
  // silently dropping the email guest.
  await page.getByRole("button", { name: "Save Event" }).click();
  await expect(page.getByRole("alert")).toContainText(
    /not a valid email address|No mail bridge|do not own/i,
    { timeout: 20_000 },
  );
});
