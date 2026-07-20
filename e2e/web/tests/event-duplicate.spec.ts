import { test, expect, navigate } from "../fixtures/index.js";
import { createEventViaDialog, openEventModal } from "../helpers.js";

const TEST_DATE = "2027-05-20";

test("user duplicates an event and saves the copy", async ({
  authedPage: page,
}) => {
  await createEventViaDialog(page, {
    date: TEST_DATE,
    title: "Origin Event",
    calendarName: "Duplicate Test Calendar",
  });

  // Open the event and choose Duplicate.
  const dialog = await openEventModal(page, "Origin Event");
  await dialog.getByRole("button", { name: "Duplicate Event" }).click();

  // The duplicate opens the create form prefilled with the original's data.
  await expect(page.getByText("Create New Event")).toBeVisible();
  const titleInput = page.getByTestId("event-title");
  await expect(titleInput).toHaveValue("Origin Event");

  await titleInput.fill("Cloned Event");
  await page.getByRole("button", { name: "Save Event" }).click();
  await expect(titleInput).not.toBeVisible({ timeout: 20_000 });

  // Both the original and the copy are on the calendar.
  await navigate(page, `/d/${TEST_DATE.replaceAll("-", "/")}`);
  await expect(page.getByText("Origin Event")).toBeVisible();
  await expect(page.getByText("Cloned Event")).toBeVisible();
});
