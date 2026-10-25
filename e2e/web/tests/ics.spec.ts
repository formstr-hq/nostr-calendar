import path from "path";
import fs from "fs/promises";
import { test, expect } from "../fixtures/index.js";
import {
  createCalendarViaSelect,
  createCalendarViaSidebar,
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
  await createCalendarViaSidebar(page, uniqueName("Zip cal"));

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
    await expect(
      dialog.getByRole("combobox", { name: "Calendar" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(eventTitle)).toBeVisible();

    await dialog.getByRole("button", { name: /Import 1 event/i }).click();
    await expect(
      dialog.getByText(/1 event imported successfully/i),
    ).toBeVisible({ timeout: 25_000 });
    await dialog.getByRole("button", { name: "Finish" }).click();
    await expect(dialog).not.toBeVisible();

    await page.goto("/d/2027/5/10");
    await expect(page.getByText(eventTitle).first()).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await fs.unlink(tmpZipPath).catch(() => {});
  }
});

test("user imports a .zip file containing multiple .ics events into the calendar", async ({
  authedPage: page,
}) => {
  await createCalendarViaSidebar(page, uniqueName("Multi zip cal"));

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const event1Title = uniqueName("Zip Meeting 1");
  const event2Title = uniqueName("Zip Meeting 2");

  zip.file(
    "cal1.ics",
    `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
UID:${uniqueName("zip-uid-1")}@google.com
DTSTART:20270511T100000Z
DTEND:20270511T110000Z
SUMMARY:${event1Title}
DESCRIPTION:Bulk imported 1 from ZIP archive
LOCATION:Room 101
END:VEVENT
END:VCALENDAR`,
  );

  zip.file(
    "cal2.ics",
    `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
UID:${uniqueName("zip-uid-2")}@google.com
DTSTART:20270511T140000Z
DTEND:20270511T150000Z
SUMMARY:${event2Title}
DESCRIPTION:Bulk imported 2 from ZIP archive
LOCATION:Room 102
END:VEVENT
END:VCALENDAR`,
  );

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const tmpZipPath = path.resolve(
    import.meta.dirname,
    `../assets/${uniqueName("test-import-multi")}.zip`,
  );
  await fs.writeFile(tmpZipPath, zipBuffer);

  try {
    await page.getByRole("button", { name: "Import .ics file" }).click();
    await page.locator('input[type="file"]').setInputFiles(tmpZipPath);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Import Events")).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByText("Destination calendars")).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByText("cal1", { exact: true })).toBeVisible();
    await expect(dialog.getByText("cal2", { exact: true })).toBeVisible();
    await expect(dialog.getByText("2 events found")).toBeVisible();
    await expect(dialog.getByText(event1Title)).toBeVisible();
    await expect(dialog.getByText(event2Title)).toBeVisible();

    await dialog.getByRole("button", { name: /Import 2 events/i }).click();
    await expect(
      dialog.getByText(/2 events imported successfully/i),
    ).toBeVisible({ timeout: 25_000 });
    await dialog.getByRole("button", { name: "Finish" }).click();
    await expect(dialog).not.toBeVisible();

    await page.goto("/d/2027/5/11");
    await expect(page.getByText(event1Title).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(event2Title).first()).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await fs.unlink(tmpZipPath).catch(() => {});
  }
});

test("user imports a .zip file when no calendars exist in the account", async ({
  carolPage: page,
}) => {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const eventTitle = uniqueName("Fresh Cal Meeting");
  zip.file(
    "fresh.ics",
    `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
UID:${uniqueName("fresh-uid")}@google.com
DTSTART:20270512T100000Z
DTEND:20270512T110000Z
SUMMARY:${eventTitle}
DESCRIPTION:Bulk imported without pre-existing calendar
LOCATION:Room 103
END:VEVENT
END:VCALENDAR`,
  );

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const tmpZipPath = path.resolve(
    import.meta.dirname,
    `../assets/${uniqueName("test-import-fresh")}.zip`,
  );
  await fs.writeFile(tmpZipPath, zipBuffer);

  try {
    await page.getByRole("button", { name: "Import .ics file" }).click();
    await page.locator('input[type="file"]').setInputFiles(tmpZipPath);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Import Events")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      dialog.getByText("A new calendar will be created for these events"),
    ).toBeVisible({ timeout: 15_000 });
    await expect(dialog.getByText(eventTitle)).toBeVisible();

    await dialog.getByRole("button", { name: /Import 1 event/i }).click();
    await expect(
      dialog.getByText(/1 event imported successfully/i),
    ).toBeVisible({ timeout: 25_000 });
    await dialog.getByRole("button", { name: "Finish" }).click();
    await expect(dialog).not.toBeVisible();

    await page.goto("/d/2027/5/12");
    await expect(page.getByText(eventTitle).first()).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await fs.unlink(tmpZipPath).catch(() => {});
  }
});

test("user imports a Google Calendar Takeout .zip with workspaces like Family and Birthdays", async ({
  authedPage: page,
}) => {
  // Pre-create "Family" calendar to verify that an existing calendar is reused and NOT duplicated!
  await createCalendarViaSidebar(page, "Family");

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const familyEventTitle = uniqueName("Family Reunion");
  const birthdayEventTitle = uniqueName("Alice Birthday");

  // Google Takeout filenames with unique ID / email keys
  zip.file(
    "Takeout/Calendar/Family_family06727983610196800049@group.calendar.google.com.ics",
    `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
X-WR-CALNAME:Family
BEGIN:VEVENT
UID:${uniqueName("family-uid")}@google.com
DTSTART:20270615T180000Z
DTEND:20270615T210000Z
SUMMARY:${familyEventTitle}
DESCRIPTION:Family dinner and reunion
LOCATION:Home
END:VEVENT
END:VCALENDAR`,
  );

  zip.file(
    "Takeout/Calendar/Birthdays_dashmanas521@gmail.com.ics",
    `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
X-WR-CALNAME:dashmanas521@gmail.com
BEGIN:VEVENT
UID:${uniqueName("bday-uid")}@google.com
DTSTART:20270616T000000Z
DTEND:20270617T000000Z
SUMMARY:${birthdayEventTitle}
DESCRIPTION:Alice's birthday celebration
END:VEVENT
END:VCALENDAR`,
  );

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const tmpZipPath = path.resolve(
    import.meta.dirname,
    `../assets/${uniqueName("test-import-takeout")}.zip`,
  );
  await fs.writeFile(tmpZipPath, zipBuffer);

  try {
    await page.getByRole("button", { name: "Import .ics file" }).click();
    await page.locator('input[type="file"]').setInputFiles(tmpZipPath);

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Import Events")).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByText("Destination calendars")).toBeVisible({
      timeout: 15_000,
    });

    // Verify chips show clean names "Family" and "Birthdays" without unique keys
    await expect(dialog.getByText("Family", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Birthdays", { exact: true })).toBeVisible();
    await expect(
      dialog.getByText("dashmanas521@gmail.com"),
    ).not.toBeVisible();
    await expect(
      dialog.getByText("group.calendar.google.com"),
    ).not.toBeVisible();

    await expect(dialog.getByText(familyEventTitle)).toBeVisible();
    await expect(dialog.getByText(birthdayEventTitle)).toBeVisible();

    await dialog.getByRole("button", { name: /Import 2 events/i }).click();
    await expect(
      dialog.getByText(/2 events imported successfully/i),
    ).toBeVisible({ timeout: 25_000 });
    await dialog.getByRole("button", { name: "Finish" }).click();
    await expect(dialog).not.toBeVisible();

    // Verify "Family" was not duplicated in the sidebar (only 1 "Family" calendar in Synced list)
    await expect(
      page.locator('[data-testid="calendar-row"]:has-text("Family")'),
    ).toHaveCount(1);
    await expect(
      page
        .locator('[data-testid="calendar-row"]:has-text("Family")')
        .locator('[data-testid="calendar-event-count"]'),
    ).toHaveText("1");

    // Verify "Birthdays" was created as a new calendar
    await expect(
      page.locator('[data-testid="calendar-row"]:has-text("Birthdays")'),
    ).toHaveCount(1);
    await expect(
      page
        .locator('[data-testid="calendar-row"]:has-text("Birthdays")')
        .locator('[data-testid="calendar-event-count"]'),
    ).toHaveText("1");

    await page.goto("/d/2027/6/15");
    await expect(page.getByText(familyEventTitle).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.goto("/d/2027/6/16");
    await expect(page.getByText(birthdayEventTitle).first()).toBeVisible({
      timeout: 20_000,
    });

    // Verify that the recurring birthday is also visible in WeekView
    await page.goto("/w/2027/165");
    await expect(page.getByText(birthdayEventTitle).first()).toBeVisible({
      timeout: 20_000,
    });
  } finally {
    await fs.unlink(tmpZipPath).catch(() => {});
  }
});


