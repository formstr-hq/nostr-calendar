import { test, expect } from "../fixtures/index.js";
import {
  createEventViaDialog,
  futureDate,
  gotoDay,
  uniqueName,
} from "../helpers.js";
import type { Locator, Page } from "@playwright/test";

// Every recurrence here is bounded with an occurrence count, and each test
// uses its own hour slot: an unbounded series would drop event cards onto
// every future day and intercept other tests' slot clicks (tests share
// Alice's account on the same relay).

async function pickRecurrence(page: Page, dialog: Locator, option: string) {
  await dialog.getByTestId("recurrence-select").click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function endAfterOccurrences(page: Page, dialog: Locator, count: number) {
  // The rebuilt editor keeps the frequency trigger in the WHEN row and moves
  // recurrence end controls into the intentional "More options" disclosure.
  await dialog.getByRole("button", { name: /More options/ }).click();
  await dialog.getByTestId("recurrence-end-mode").click();
  await page.getByRole("option", { name: "After", exact: true }).click();
  await dialog.getByLabel("Occurrences").fill(String(count));
}

test("daily recurring event shows on following days", async ({
  authedPage: page,
}) => {
  const title = uniqueName("Daily standup");
  const date = futureDate(10);

  await createEventViaDialog(page, {
    date,
    title,
    calendarName: uniqueName("Rec cal"),
    slotIndex: 4,
    configure: async (dialog) => {
      await pickRecurrence(page, dialog, "Daily");
      await endAfterOccurrences(page, dialog, 3);
    },
  });

  await gotoDay(page, futureDate(11));
  await expect(page.getByText(title)).toBeVisible();
  await gotoDay(page, futureDate(12));
  await expect(page.getByText(title)).toBeVisible();
});

test("weekly recurring event shows a week later but not the next day", async ({
  authedPage: page,
}) => {
  const title = uniqueName("Weekly sync");
  const date = futureDate(10);

  await createEventViaDialog(page, {
    date,
    title,
    calendarName: uniqueName("Rec cal"),
    slotIndex: 6,
    configure: async (dialog) => {
      await pickRecurrence(page, dialog, "Weekly");
      await endAfterOccurrences(page, dialog, 2);
    },
  });

  await gotoDay(page, futureDate(11));
  await expect(page.getByText(title)).not.toBeVisible();
  await gotoDay(page, futureDate(17));
  await expect(page.getByText(title)).toBeVisible();
});

test("daily recurrence ending after 2 occurrences stops repeating", async ({
  authedPage: page,
}) => {
  const title = uniqueName("Short series");
  const date = futureDate(10);

  await createEventViaDialog(page, {
    date,
    title,
    calendarName: uniqueName("Rec cal"),
    slotIndex: 8,
    configure: async (dialog) => {
      await pickRecurrence(page, dialog, "Daily");
      await endAfterOccurrences(page, dialog, 2);
    },
  });

  // Occurrence 2 of 2 lands on the next day; the day after has none.
  await gotoDay(page, futureDate(11));
  await expect(page.getByText(title)).toBeVisible();
  await gotoDay(page, futureDate(12));
  await expect(page.getByText(title)).not.toBeVisible();
});

test("custom rule repeats every 2 days", async ({ authedPage: page }) => {
  const title = uniqueName("Custom repeat");
  const date = futureDate(10);

  await createEventViaDialog(page, {
    date,
    title,
    calendarName: uniqueName("Rec cal"),
    slotIndex: 13,
    configure: async (dialog) => {
      await pickRecurrence(page, dialog, "Custom Rule");

      // Picking "Custom Rule" opens the custom recurrence dialog.
      const customDialog = page
        .getByRole("dialog")
        .filter({ hasText: "Custom recurrence" });
      await expect(customDialog).toBeVisible();
      // Default draft is "every 1 week on Monday" — switch the unit to days
      // and the interval to 2, ending after 3 occurrences.
      await customDialog.getByRole("combobox").click();
      await page.getByRole("option", { name: "Day", exact: true }).click();
      // The dialog's plain number fields (interval, count) — the DatePicker's
      // date sections are also role=spinbutton, so target by input type.
      const numberFields = customDialog.locator('input[type="number"]');
      await numberFields.first().fill("2");
      await customDialog.getByRole("button", { name: "After", exact: true }).click();
      await numberFields.nth(1).fill("3");
      await customDialog.getByRole("button", { name: "Save", exact: true }).click();
      await expect(customDialog).not.toBeVisible();
    },
  });

  await gotoDay(page, futureDate(11));
  await expect(page.getByText(title)).not.toBeVisible();
  await gotoDay(page, futureDate(12));
  await expect(page.getByText(title)).toBeVisible();
});
