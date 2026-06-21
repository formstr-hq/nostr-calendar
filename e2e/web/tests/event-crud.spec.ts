import { test, expect } from "../fixtures/index.js";

// Navigate to a fixed future date so the test is date-independent.
const TEST_DATE = "2027-01-15";
const [year, month, day] = TEST_DATE.split("-");

test("user opens the app and creates a calendar event", async ({ authedPage: page }) => {
  // Navigate to the day view for the test date
  await page.goto(`/d/${year}/${month}/${day}`);

  // Click a time slot on the grid to open the create-event dialog.
  // The DayView renders 24 hour-cells, each with data-date. We click the
  // 10am slot (index 10) so the dialog pre-fills a reasonable start time.
  await page.locator(`[data-date="${TEST_DATE}"]`).nth(10).click();

  // Scope interactions inside the dialog
  const dialog = page.getByRole("dialog");
  await dialog.waitFor({ state: "visible" });

  // Fill in the event title
  await dialog.getByPlaceholder("Enter event title").fill("Team Standup");

  // Open the calendar selector and create a new calendar (required to enable Save).
  const calendarSelect = dialog.getByTestId("calendar-list-select");
  await calendarSelect.scrollIntoViewIfNeeded();
  await calendarSelect.click();
  await page.getByRole("option", { name: "Add new calendar" }).click();

  // CalendarManageDialog opens — fill the name and confirm.
  const calendarDialog = page.getByRole("dialog", { name: "New Calendar" });
  await calendarDialog.waitFor({ state: "visible" });
  await calendarDialog.getByLabel("Calendar Name").fill("My Calendar");
  await calendarDialog.getByRole("button", { name: "Create" }).click();
  await calendarDialog.waitFor({ state: "hidden" });

  // Save — button text comes from the "event.saveEvent" i18n key ("Save Event")
  await dialog.getByRole("button", { name: "Save Event" }).click();

  // The dialog closes and the new event appears on the calendar grid
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Team Standup")).toBeVisible();
});
