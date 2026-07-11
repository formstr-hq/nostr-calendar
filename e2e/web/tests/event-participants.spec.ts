import { TEST_KEYS } from "../../relay/seed/keys.js";
import { test, expect, navigate } from "../fixtures/index.js";
import { createEventViaDialog, openEventEditor } from "../helpers.js";

const TEST_DATE = "2027-06-15";

// Seeded kind-0 profiles give Bob and Carol readable names in the UI.
test("user adds and removes event participants", async ({
  authedPage: page,
}) => {
  await createEventViaDialog(page, {
    date: TEST_DATE,
    title: "Team Offsite",
    calendarName: "Participants Test Calendar",
  });

  await openEventEditor(page, "Team Offsite");

  // Add Bob and Carol by npub.
  const participantInput = page.getByPlaceholder("Enter participant nPub");
  await participantInput.fill(TEST_KEYS.bob.npub);
  await participantInput.press("Enter");
  await expect(
    page.getByRole("listitem").filter({ hasText: "Bob" }),
  ).toBeVisible();

  await participantInput.fill(TEST_KEYS.carol.npub);
  await participantInput.press("Enter");
  await expect(
    page.getByRole("listitem").filter({ hasText: "Carol" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Save Event" }).click();
  await expect(page.getByTestId("event-title")).not.toBeVisible({
    timeout: 20_000,
  });

  // Reopen the editor: both participants were persisted.
  await navigate(page, `/d/${TEST_DATE.replaceAll("-", "/")}`);
  await openEventEditor(page, "Team Offsite");
  await expect(
    page.getByRole("listitem").filter({ hasText: "Bob" }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Carol" }),
  ).toBeVisible();

  // Remove Bob, keep Carol.
  await page
    .getByRole("listitem")
    .filter({ hasText: "Bob" })
    .getByRole("button", { name: "Remove" })
    .click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Bob" }),
  ).not.toBeVisible();

  await page.getByRole("button", { name: "Save Event" }).click();
  await expect(page.getByTestId("event-title")).not.toBeVisible({
    timeout: 20_000,
  });

  // Reopen once more: only Carol remains.
  await navigate(page, `/d/${TEST_DATE.replaceAll("-", "/")}`);
  await openEventEditor(page, "Team Offsite");
  await expect(
    page.getByRole("listitem").filter({ hasText: "Carol" }),
  ).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Bob" }),
  ).not.toBeVisible();
});
