import { test, expect, navigate } from "../fixtures/index.js";
import { uniqueName } from "../helpers.js";
import type { Page } from "@playwright/test";

// Deep coverage of the availability builder (/schedule/create). The basic
// create + book + approve/decline flow lives in booking.spec.ts.

async function startNewPage(page: Page, title: string) {
  await navigate(page, "/schedule/create");
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
}

async function createAndGetShareUrl(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Create page", exact: true }).click();
  await expect(page.getByText("Scheduling page created!")).toBeVisible({
    timeout: 20_000,
  });
  const url = await page.getByLabel("booking page link").inputValue();
  expect(url).toContain("/schedule/naddr");
  return url;
}

test("durations, weekly availability and blocked dates persist across edit", async ({
  authedPage: page,
}) => {
  const title = uniqueName("Builder page");
  await startNewPage(page, title);

  // Durations: enable the 1h preset and add a custom 45-minute chip.
  await page.getByRole("button", { name: "1h" }).click();
  await page.getByLabel("Custom (min)").fill("45");
  await page.getByLabel("Custom (min)").press("Enter");
  await expect(page.getByRole("button", { name: "45m" })).toBeVisible();

  // Weekly availability: turn Monday off (MUI Switch exposes role checkbox).
  const monday = page.getByRole("checkbox", { name: "Monday" });
  await expect(monday).toBeChecked();
  await monday.click();
  await expect(monday).not.toBeChecked();

  // Blocked dates: add one (defaults are fine — we only check persistence).
  await page
    .getByRole("button", { name: "Add Date", exact: true })
    .nth(1)
    .click();

  const shareUrl = await createAndGetShareUrl(page);
  const naddr = shareUrl.match(/\/schedule\/(naddr[^?]+)/)?.[1];
  expect(naddr).toBeTruthy();

  // Reopen in edit mode: everything persisted.
  await navigate(page, `/schedule/edit/${naddr}`);
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue(title);
  await expect(page.getByRole("button", { name: "45m" })).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Monday" }),
  ).not.toBeChecked();
  await expect(
    page.getByText("No blocked dates", { exact: false }),
  ).not.toBeVisible();
});

test("public booking page offers the configured durations", async ({
  authedPage: page,
  bobPage: bob,
}) => {
  const title = uniqueName("Duration page");
  await startNewPage(page, title);

  // Offer 30m (default) plus a custom 45m option.
  await page.getByLabel("Custom (min)").fill("45");
  await page.getByLabel("Custom (min)").press("Enter");
  await expect(page.getByRole("button", { name: "45m" })).toBeVisible();

  const shareUrl = await createAndGetShareUrl(page);

  // Bob picks a duration on the public page; the slot grid renders.
  await navigate(bob, shareUrl);
  await expect(bob.getByText(title)).toBeVisible({ timeout: 20_000 });
  await expect(bob.getByRole("button", { name: "30 min" })).toBeVisible();
  await bob.getByRole("button", { name: "45 min" }).click();

  // Next week always has slots (this week may be partially in the past).
  await bob.getByRole("button", { name: "next week" }).click();
  const slots = bob
    .getByRole("button", { name: /\d{1,2}:\d{2}/ })
    .and(bob.locator(":enabled"));
  await expect(slots.first()).toBeVisible({ timeout: 15_000 });
});

test("blocked dates remove that day's slots from the public page", async ({
  authedPage: page,
  bobPage: bob,
}) => {
  const title = uniqueName("Blocked page");
  await startNewPage(page, title);

  // Block the Wednesday of next week (Sunday-start weeks, matching the
  // public page's grid). The default blocked window (09:00–17:00) matches
  // the default weekly availability, so setting only the date blocks the
  // whole day.
  const now = new Date();
  const blocked = new Date(now);
  blocked.setDate(now.getDate() + (7 - now.getDay()) + 3);

  // Two "Add Date" buttons on the page: one-off windows first, blocked
  // dates second.
  await page
    .getByRole("button", { name: "Add Date", exact: true })
    .nth(1)
    .click();

  // Pick the date via the calendar popup — typing sections into this
  // controlled DatePicker stores transient invalid values and blanks it.
  await page.getByRole("button", { name: "Choose date" }).last().click();
  const calendar = page.getByRole("dialog");
  const monthLabelOnPicker = blocked.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  if (!(await calendar.getByText(monthLabelOnPicker).isVisible())) {
    await calendar.getByRole("button", { name: "Next month" }).click();
  }
  await calendar
    .getByRole("gridcell", { name: String(blocked.getDate()), exact: true })
    .click();
  await expect(calendar).not.toBeVisible();

  const shareUrl = await createAndGetShareUrl(page);

  await navigate(bob, shareUrl);
  await expect(bob.getByText(title)).toBeVisible({ timeout: 20_000 });
  await bob.getByRole("button", { name: "next week" }).click();

  // Other weekdays have slots…
  const slots = bob
    .getByRole("button", { name: /\d{1,2}:\d{2}/ })
    .and(bob.locator(":enabled"));
  await expect(slots.first()).toBeVisible({ timeout: 15_000 });

  // …but every slot in the blocked day's column renders disabled
  // (struck-through), so nothing there can be booked.
  const pad = (n: number) => String(n).padStart(2, "0");
  const blockedDateKey = `${blocked.getFullYear()}-${pad(blocked.getMonth() + 1)}-${pad(blocked.getDate())}`;
  const blockedColumn = bob.locator(
    `[data-testid="booking-day-column"][data-date="${blockedDateKey}"]`,
  );
  await expect(blockedColumn).toBeVisible();
  const blockedColumnSlots = blockedColumn.getByRole("button", {
    name: /\d{1,2}:\d{2}/,
  });
  expect(await blockedColumnSlots.count()).toBeGreaterThan(0);
  await expect(blockedColumnSlots.and(bob.locator(":enabled"))).toHaveCount(0);
});
