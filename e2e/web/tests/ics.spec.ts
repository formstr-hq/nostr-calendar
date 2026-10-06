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
  await expect(page.getByText("ICS Imported Meeting").first()).toBeVisible({
    timeout: 20_000,
  });
});

test("native ICS bridge opens a prefilled event editor", async ({
  authedPage: page,
}) => {
  const content = await fs.readFile(ICS_FIXTURE, "utf-8");

  await page.evaluate((icsContent) => {
    window.dispatchEvent(
      new CustomEvent("icsFileReceived", { detail: icsContent }),
    );
  }, content);

  await expect(page.getByRole("dialog").getByTestId("event-title")).toHaveValue(
    "ICS Imported Meeting",
  );
});

test("user downloads an event as .ics", async ({ authedPage: page }) => {
  const title = uniqueName("Export me");
  await createEventViaDialog(page, {
    date: futureDate(40),
    title,
    calendarName: uniqueName("Export cal"),
  });

  const modal = await openEventModal(page, title);
  await modal.getByRole("button", { name: "More options" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download event details" }).click();
  const download = await downloadPromise;

  const filePath = await download.path();
  const content = await fs.readFile(filePath, "utf-8");
  expect(content).toContain("BEGIN:VCALENDAR");
  expect(content).toContain("BEGIN:VEVENT");
  expect(content).toContain(title);
});

test("user imports a .zip file containing .ics events into the calendar", async ({
  authedPage: page,
}) => {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const eventTitle = uniqueName("Zip Meeting");
  zip.file(
    "calendar.ics",
    `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
UID:${uniqueName("zip-uid")}@google.com
DTSTART:20270510T100000Z
DTEND:20270510T110000Z
SUMMARY:${eventTitle}
DESCRIPTION:Bulk imported from ZIP archive
LOCATION:Room 404
END:VEVENT
END:VCALENDAR`,
  );

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const tmpZipPath = path.resolve(
    import.meta.dirname,
    `../assets/${uniqueName("test-import")}.zip`,
  );
  await fs.writeFile(tmpZipPath, zipBuffer);

  try {
    await page.getByRole("button", { name: "Import .ics file" }).click();
    await page.locator('input[type="file"]').setInputFiles(tmpZipPath);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Import Events")).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByText(eventTitle)).toBeVisible();

    await dialog.getByRole("button", { name: /Import 1 event/i }).click();
    await expect(dialog).not.toBeVisible({ timeout: 25_000 });

    await page.goto("/d/2027/5/10");
    await expect(page.getByText(eventTitle).first()).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await fs.unlink(tmpZipPath).catch(() => {});
  }
});
