import { test, expect } from "../fixtures/index.js";
import {
  createEventViaDialog,
  futureDate,
  openEventModal,
  uniqueName,
} from "../helpers.js";

// Each test creates its own event (unique title + calendar) so parallel
// runs never race. Alice authors the event, so the author options are
// offered: delete-for-everyone and remove-from-calendar. The third option
// ("Ignore invitation") only makes sense for an invited participant and is
// covered in invitations.spec.ts.

async function openDeleteDialog(page: import("@playwright/test").Page, title: string) {
  const modal = await openEventModal(page, title);
  await modal.getByRole("button", { name: "Delete Event" }).click();
  const deleteDialog = page.getByRole("dialog").filter({ hasText: "Delete Event" });
  await expect(deleteDialog).toBeVisible();
  return deleteDialog;
}

test("author deletes an event for everyone", async ({ authedPage: page }) => {
  const title = uniqueName("Delete everyone");
  const date = futureDate(7);
  await createEventViaDialog(page, {
    date,
    title,
    calendarName: uniqueName("Del cal"),
  });

  const dialog = await openDeleteDialog(page, title);
  await dialog.getByTestId("delete-option-everyone").click();
  await dialog.getByRole("button", { name: "Confirm" }).click();

  await expect(dialog).not.toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(title)).not.toBeVisible();
});

test("user removes an event from their calendar only", async ({
  authedPage: page,
}) => {
  const title = uniqueName("Remove from cal");
  const date = futureDate(8);
  await createEventViaDialog(page, {
    date,
    title,
    calendarName: uniqueName("Del cal"),
  });

  const dialog = await openDeleteDialog(page, title);
  await dialog.getByTestId("delete-option-remove").click();
  await dialog.getByRole("button", { name: "Confirm" }).click();

  await expect(dialog).not.toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(title)).not.toBeVisible();
});

