import { test, expect, navigate } from "../fixtures/index.js";
import {
  createEventViaDialog,
  fillDateTimeField,
  openEventEditor,
  openEventModal,
} from "../helpers.js";

// Fixed future dates so the test is date-independent.
const ORIGINAL_DATE = "2027-04-12";
const MOVED_DATE = "2027-04-13";

test("user edits an event's name, description and time", async ({
  authedPage: page,
}) => {
  await createEventViaDialog(page, {
    date: ORIGINAL_DATE,
    title: "Morning Sync",
    calendarName: "Edit Test Calendar",
  });

  await openEventEditor(page, "Morning Sync");

  // Rename, describe, and move the event one day later.
  await page.getByTestId("event-title").fill("Quarterly Review");
  await page
    .getByPlaceholder("Add event description...")
    .fill("Rescheduled and renamed by the e2e suite");
  await fillDateTimeField(page, "Start time", "04/13/2027 11:00 AM");
  await fillDateTimeField(page, "End time", "04/13/2027 12:00 PM");

  await page.getByRole("button", { name: "Save Event" }).click();
  await expect(page.getByTestId("event-title")).not.toBeVisible({
    timeout: 20_000,
  });

  // The event now lives on the new day with the new title...
  await navigate(page, `/d/${MOVED_DATE.replaceAll("-", "/")}`);
  await expect(page.getByText("Quarterly Review")).toBeVisible({
    timeout: 30_000,
  });

  // ...and the updated description shows in the event view.
  const viewDialog = await openEventModal(page, "Quarterly Review");
  await expect(
    viewDialog.getByText("Rescheduled and renamed by the e2e suite"),
  ).toBeVisible();
  await viewDialog.getByRole("button", { name: "Close" }).click();

  // The original day no longer shows it under either name.
  await navigate(page, `/d/${ORIGINAL_DATE.replaceAll("-", "/")}`);
  await expect(page.locator(`[data-date="${ORIGINAL_DATE}"]`).first()).toBeVisible();
  await expect(page.getByText("Quarterly Review")).not.toBeVisible();
  await expect(page.getByText("Morning Sync")).not.toBeVisible();
});
