import path from "path";
import fs from "fs/promises";
import { test, expect } from "../fixtures/index.js";
import {
  createCalendarViaSelect,
  createEventViaDialog,
  futureDate,
  openEventModal,
  uniqueName,
} from "../helpers.js";

const ICS_FIXTURE = path.resolve(import.meta.dirname, "../assets/sample.ics");

test("user imports an .ics file into a new event", async ({
  authedPage: page,
}) => {
  // The header import button triggers a hidden file input.
  await page.getByRole("button", { name: "Import .ics file" }).click();
  await page.locator('input[type="file"]').setInputFiles(ICS_FIXTURE);

  // The event editor opens prefilled from the ICS VEVENT.
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("event-title")).toHaveValue(
    "ICS Imported Meeting",
  );

  await createCalendarViaSelect(page, dialog, uniqueName("ICS cal"));
  await dialog.getByRole("button", { name: "Save Event" }).click();
  await expect(dialog).not.toBeVisible({ timeout: 20_000 });

  // DTSTART in the fixture is 2027-03-10.
  await page.goto("/d/2027/3/10");
  await expect(page.getByText("ICS Imported Meeting")).toBeVisible({
    timeout: 20_000,
  });
});

test("user downloads an event as .ics", async ({ authedPage: page }) => {
  const title = uniqueName("Export me");
  await createEventViaDialog(page, {
    date: futureDate(40),
    title,
    calendarName: uniqueName("Export cal"),
  });

  const modal = await openEventModal(page, title);
  const downloadPromise = page.waitForEvent("download");
  await modal.getByRole("button", { name: "Download event details" }).click();
  const download = await downloadPromise;

  const filePath = await download.path();
  const content = await fs.readFile(filePath, "utf-8");
  expect(content).toContain("BEGIN:VCALENDAR");
  expect(content).toContain("BEGIN:VEVENT");
  expect(content).toContain(title);
});
