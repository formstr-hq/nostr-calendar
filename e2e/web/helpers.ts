import { expect, type Locator, type Page } from "@playwright/test";
import { TEST_KEYS } from "../relay/seed/keys.js";
import { navigate } from "./fixtures/index.js";

/**
 * Opens the calendar selector inside `scope` (an event / booking dialog or a
 * page) and creates a brand-new calendar with the given name. Creating a
 * fresh calendar per test keeps parallel tests from racing on a shared one.
 */
export async function createCalendarViaSelect(
  page: Page,
  scope: Locator | Page,
  calendarName: string,
): Promise<void> {
  const select = scope.getByTestId("calendar-list-select");
  await select.scrollIntoViewIfNeeded();
  await select.click();
  await page.getByRole("option", { name: "Add new calendar" }).click();

  const calendarDialog = page.getByRole("dialog", { name: "New Calendar" });
  await calendarDialog.waitFor({ state: "visible" });
  await calendarDialog.getByLabel("Calendar Name").fill(calendarName);
  await calendarDialog.getByRole("button", { name: "Create" }).click();
  await calendarDialog.waitFor({ state: "hidden" });
}

/**
 * Creates a private event through the day-view click-to-create dialog and
 * waits until it shows up on the grid. `date` is YYYY-MM-DD; `slotIndex` is
 * the hour cell to click (10 = 10am).
 */
export async function createEventViaDialog(
  page: Page,
  {
    date,
    title,
    calendarName,
    slotIndex = 10,
    configure,
  }: {
    date: string;
    title: string;
    calendarName: string;
    slotIndex?: number;
    // Extra editor interactions (recurrence, participants, …) run after the
    // title/calendar are filled and before Save is clicked.
    configure?: (dialog: Locator) => Promise<void>;
  },
): Promise<void> {
  const [year, month, day] = date.split("-");
  await navigate(page, `/d/${year}/${month}/${day}`);

  await page.locator(`[data-date="${date}"]`).nth(slotIndex).click();

  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  await dialog.getByPlaceholder("Enter event title").fill(title);
  await createCalendarViaSelect(page, dialog, calendarName);
  if (configure) {
    await configure(dialog);
  }
  await dialog.getByRole("button", { name: "Save Event" }).click();

  await expect(dialog).not.toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(title).first()).toBeVisible();
}

/**
 * Opens the event-view modal for an event visible on the calendar grid.
 * Clicking an event chip opens the quick-peek popover first (F-VIEWS); this
 * follows its "Open" link to reach the full modal. Returns the dialog locator.
 */
export async function openEventModal(page: Page, title: string): Promise<Locator> {
  await page.getByText(title).first().click();
  await page.getByRole("button", { name: "Open →" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });
  return dialog;
}

/**
 * Waits for the sidebar (calendar list, mini calendar, scheduling links) to
 * be ready. The desktop Sidebar is persistent — nothing to open — this just
 * guards against racing the initial render.
 */
export async function openSidebar(page: Page): Promise<void> {
  await expect(page.getByText("Calendars", { exact: true })).toBeVisible();
}

/** A unique-enough suffix so parallel tests never share entity names. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Returns YYYY-MM-DD for `daysFromNow` days in the future (local time). */
export function futureDate(daysFromNow: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Navigates to the day view for a YYYY-MM-DD date. */
export async function gotoDay(page: Page, date: string): Promise<void> {
  const [year, month, day] = date.split("-");
  await navigate(page, `/d/${year}/${month}/${day}`);
}

/**
 * Creates a calendar through the sidebar's add button. Use this when the
 * user needs a calendar but no calendar-select is on screen (e.g. the
 * respond panel renders only a spinner for users with zero calendars).
 */
export async function createCalendarViaSidebar(
  page: Page,
  calendarName: string,
): Promise<void> {
  await openSidebar(page);
  await page
    .getByRole("button", { name: "create calendar", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "New Calendar" });
  await dialog.getByLabel("Calendar Name").fill(calendarName);
  await dialog.getByRole("button", { name: "Create" }).click();
  await dialog.waitFor({ state: "hidden" });
}

/**
 * As `authorPage`'s user, creates a private event with a participant (sends
 * them a gift-wrap invitation) and returns the shareable event URL (includes
 * the viewKey for private events).
 */
export async function createInviteEvent(
  authorPage: Page,
  {
    date,
    title,
    calendarName,
    participantNpub,
  }: {
    date: string;
    title: string;
    calendarName: string;
    participantNpub: string;
  },
): Promise<string> {
  await createEventViaDialog(authorPage, {
    date,
    title,
    calendarName,
    configure: async (dialog) => {
      const participantInput = dialog.getByPlaceholder("Enter participant nPub");
      await participantInput.fill(participantNpub);
      await participantInput.press("Enter");
      // Wait for the participant chip to resolve before saving.
      await expect(dialog.getByRole("listitem")).toBeVisible();
    },
  });

  const modal = await openEventModal(authorPage, title);
  await modal.getByRole("button", { name: "More options" }).click();
  // MUI renders menus in a portal, outside the event dialog's DOM subtree.
  const href = await authorPage
    .getByRole("menuitem", { name: "Open event in new tab" })
    .getAttribute("href");
  if (!href) throw new Error("Event link not found in event modal");
  // The first Escape dismisses the portalled overflow menu; the second uses
  // the dialog's native MUI Escape handling. This also works on layouts where
  // the close icon is intentionally hidden.
  await authorPage.keyboard.press("Escape");
  await authorPage.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();
  return href;
}

/**
 * Opens an event's view modal from the calendar grid and clicks through to
 * the edit page, waiting for the form to be loaded with the event's title.
 */
export async function openEventEditor(page: Page, title: string): Promise<void> {
  const dialog = await openEventModal(page, title);
  await dialog.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Edit Event" }).click();
  await expect(page.getByTestId("event-title")).toHaveValue(title);
}

/**
 * Types a full date-time into one of the MUI picker fields on the event form.
 * `fieldLabel` is the picker label ("Start time" / "End time") and `value`
 * must be formatted as "MM/DD/YYYY hh:mm AM|PM".
 */
export async function fillDateTimeField(
  page: Page,
  fieldLabel: string,
  value: string,
): Promise<void> {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) (AM|PM)$/);
  if (!match) {
    throw new Error(`Expected "MM/DD/YYYY hh:mm AM|PM", got "${value}"`);
  }
  const [, month, day, year, hours, minutes, meridiem] = match;

  const field = page.getByRole("group", { name: fieldLabel });
  // The redesigned MUI field exposes separate text inputs for its date and
  // time sections. Filling those inputs is stable across localized month
  // labels, unlike asserting against the group text content.
  const inputs = field.getByRole("textbox");
  await inputs.nth(0).fill(`${month}/${day}/${year}`);
  await inputs.nth(1).fill(`${hours}:${minutes} ${meridiem}`);
}

/**
 * Navigates to the bookings page via the persistent sidebar's "View
 * Bookings" link. Mounting the sidebar is what starts the booking-request
 * relay subscriptions, so this is the realistic path to a live /bookings
 * view.
 */
export async function openBookingsViaSidebar(page: Page): Promise<void> {
  await page.getByRole("button", { name: "View Bookings" }).click();
  await page.waitForURL("**/bookings");
}

/**
 * Creates a booking (scheduling) page with default availability and returns
 * its public share URL (includes the viewKey query parameter).
 */
export async function createBookingPage(
  page: Page,
  title: string,
): Promise<string> {
  await navigate(page, "/bookings");
  await page.getByRole("button", { name: "New Page" }).click();
  await page.waitForURL("**/schedule/create");

  // The label text is "Title *" (required marker), so match the accessible
  // name via role instead of getByLabel.
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(title);
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page.getByText("Scheduling page created!")).toBeVisible({
    timeout: 20_000,
  });

  const pageUrl = await page.getByLabel("booking page link").inputValue();
  expect(pageUrl).toContain("/schedule/naddr");
  return pageUrl;
}

/**
 * As Bob, opens a booking link, picks the first available slot of next week
 * (always fully in the future) and submits a booking request.
 */
export async function bookFirstSlot(
  page: Page,
  pageUrl: string,
  meetingTitle: string,
  calendarName: string,
): Promise<void> {
  await navigate(page, pageUrl, TEST_KEYS.bob);
  await page.getByRole("button", { name: "next week" }).click();

  // Slot buttons are labelled with their start time, e.g. "09:00 AM".
  const slots = page
    .getByRole("button", { name: /\d{1,2}:\d{2}/ })
    .and(page.locator(":enabled"));
  await expect(slots.first()).toBeVisible({ timeout: 15_000 });
  await slots.first().click();

  const dialog = page.getByRole("dialog", { name: "Confirm Booking" });
  await dialog.waitFor({ state: "visible" });
  await dialog.getByLabel("Meeting title").fill(meetingTitle);
  await createCalendarViaSelect(page, dialog, calendarName);
  await dialog.getByRole("button", { name: "Request Booking" }).click();

  await expect(page.getByText("Booking request sent!")).toBeVisible({
    timeout: 20_000,
  });
}
