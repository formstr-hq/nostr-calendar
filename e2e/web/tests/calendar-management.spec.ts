import { test, expect } from "../fixtures/index.js";
import {
  createCalendarViaSelect,
  createEventViaDialog,
  futureDate,
  openEventModal,
  openSidebar,
  uniqueName,
} from "../helpers.js";

test("user creates, renames and deletes a calendar from the sidebar", async ({
  authedPage: page,
}) => {
  const name = uniqueName("Sidebar cal");
  const renamed = `${name} v2`;

  await openSidebar(page);
  // The add button next to the "Calendars" heading.
  await page.getByRole("button", { name: "create calendar", exact: true }).click();

  const createDialog = page.getByRole("dialog", { name: "New Calendar" });
  await createDialog.getByLabel("Calendar Name").fill(name);
  await createDialog.getByRole("button", { name: "Create" }).click();
  await expect(createDialog).not.toBeVisible();

  const row = page.getByTestId("calendar-row").filter({ hasText: name });
  await expect(row).toBeVisible();

  // Rename via the edit dialog (click the calendar's name).
  await row.getByText(name).click();
  const editDialog = page.getByRole("dialog", { name: "Edit Calendar" });
  await editDialog.getByLabel("Calendar Name").fill(renamed);
  await editDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editDialog).not.toBeVisible();
  await expect(
    page.getByTestId("calendar-row").filter({ hasText: renamed }),
  ).toBeVisible();

  // Delete it — confirmation is inline in the same dialog.
  await page.getByTestId("calendar-row").filter({ hasText: renamed }).getByText(renamed).click();
  await editDialog.getByRole("button", { name: "Delete", exact: true }).click();
  await editDialog.getByRole("button", { name: "Really Delete?" }).click();
  await expect(editDialog).not.toBeVisible();
  await expect(
    page.getByTestId("calendar-row").filter({ hasText: renamed }),
  ).not.toBeVisible();
});

test("toggling calendar visibility hides its events on the grid", async ({
  authedPage: page,
}) => {
  const calendarName = uniqueName("Vis cal");
  const title = uniqueName("Visible event");
  const date = futureDate(14);

  await createEventViaDialog(page, { date, title, calendarName });
  await expect(page.getByText(title)).toBeVisible();

  await openSidebar(page);
  const checkbox = page
    .getByTestId("calendar-row")
    .filter({ hasText: calendarName })
    .getByTestId("calendar-visibility-checkbox");

  await checkbox.click();
  await page.keyboard.press("Escape"); // close the drawer
  await expect(page.getByText(title)).not.toBeVisible();

  await openSidebar(page);
  await checkbox.click();
  await page.keyboard.press("Escape");
  await expect(page.getByText(title)).toBeVisible();
});

test("user moves an event to a different calendar", async ({
  authedPage: page,
}) => {
  const firstCalendar = uniqueName("Move src");
  const secondCalendar = uniqueName("Move dst");
  const title = uniqueName("Movable event");
  const date = futureDate(15);

  await createEventViaDialog(page, { date, title, calendarName: firstCalendar });

  // Create the destination calendar via any calendar select — reuse the event
  // editor's selector, then cancel out of the editor.
  await page.locator(`[data-date="${date}"]`).nth(12).click();
  const editor = page.getByRole("dialog");
  await createCalendarViaSelect(page, editor, secondCalendar);
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).not.toBeVisible();

  // Open the event and move it.
  const modal = await openEventModal(page, title);
  await expect(modal.getByText(firstCalendar)).toBeVisible();
  await modal.getByRole("button", { name: "change calendar" }).click();
  await modal.getByTestId("calendar-list-select").click();
  await page.getByRole("option", { name: secondCalendar }).click();
  await modal.getByRole("button", { name: "Save", exact: true }).click();

  await expect(modal.getByText(secondCalendar)).toBeVisible({ timeout: 20_000 });
});
