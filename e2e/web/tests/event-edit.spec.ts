import { test, expect, navigate } from "../fixtures/index.js";
import {
  createEventViaDialog,
  openEventEditor,
  openEventModal,
} from "../helpers.js";

// Fixed future date so the test is date-independent.
const ORIGINAL_DATE = "2027-04-12";

test("user edits an event's name and description", async ({
  authedPage: page,
}) => {
  await createEventViaDialog(page, {
    date: ORIGINAL_DATE,
    title: "Morning Sync",
    calendarName: "Edit Test Calendar",
  });

  await openEventEditor(page, "Morning Sync");

  // Rename and describe the event. Date/time editing is covered by the
  // picker-focused editor tests; this flow verifies event-page editing.
  await page.getByTestId("event-title").fill("Quarterly Review");
  await page
    .getByPlaceholder("Add event description...")
    .fill("Rescheduled and renamed by the e2e suite");

  await page.getByRole("button", { name: "Save Event" }).click();
  await expect(page.getByTestId("event-title")).not.toBeVisible({
    timeout: 20_000,
  });

  // The edited event remains visible on its day with the new title...
  await navigate(page, `/d/${ORIGINAL_DATE.replaceAll("-", "/")}`);
  await expect(page.getByText("Quarterly Review")).toBeVisible({
    timeout: 30_000,
  });

  // ...and the updated description shows in the event view.
  const viewDialog = await openEventModal(page, "Quarterly Review");
  await expect(
    viewDialog.getByText("Rescheduled and renamed by the e2e suite"),
  ).toBeVisible();
  await viewDialog.getByRole("button", { name: "Close" }).click();

  // The original name no longer appears.
  await expect(page.locator(`[data-date="${ORIGINAL_DATE}"]`).first()).toBeVisible();
  await expect(page.getByText("Morning Sync")).not.toBeVisible();
});
