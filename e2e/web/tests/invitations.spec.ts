import { test, expect, navigate } from "../fixtures/index.js";
import { TEST_KEYS } from "../../relay/seed/keys.js";
import {
  createInviteEvent,
  futureDate,
  gotoDay,
  openEventModal,
  uniqueName,
} from "../helpers.js";
import type { Page } from "@playwright/test";

// Bob invites Alice to a private event; Alice handles it on /notifications.

async function inviteAlice(
  bobPage: Page,
  { date, title }: { date: string; title: string },
): Promise<void> {
  await createInviteEvent(bobPage, {
    date,
    title,
    calendarName: uniqueName("Bob cal"),
    participantNpub: TEST_KEYS.alice.npub,
  });
}

function invitationCard(page: Page, title: string) {
  return page.getByTestId("invitation-card").filter({ hasText: title });
}

test("invitee accepts an invitation into a calendar", async ({
  authedPage: alice,
  bobPage: bob,
}) => {
  const title = uniqueName("Team dinner");
  const date = futureDate(20);
  await inviteAlice(bob, { date, title });

  await navigate(alice, "/notifications");
  const card = invitationCard(alice, title);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: "Add to Calendar" }).click();

  const dialog = alice.getByRole("dialog", { name: "Add to Calendar" });
  await dialog.getByTestId("calendar-list-select").click();
  await alice.getByRole("option", { name: "Add new calendar" }).click();
  const calendarDialog = alice.getByRole("dialog", { name: "New Calendar" });
  await calendarDialog.getByLabel("Calendar Name").fill(uniqueName("Invited"));
  await calendarDialog.getByRole("button", { name: "Create" }).click();
  await dialog.getByRole("button", { name: "Add", exact: true }).click();

  await expect(card).not.toBeVisible({ timeout: 20_000 });

  // The accepted event now renders on Alice's calendar.
  await gotoDay(alice, date);
  await expect(alice.getByText(title)).toBeVisible({ timeout: 20_000 });
});

test("invitee dismisses an invitation", async ({
  authedPage: alice,
  bobPage: bob,
}) => {
  const title = uniqueName("Boring meeting");
  await inviteAlice(bob, { date: futureDate(21), title });

  await navigate(alice, "/notifications");
  const card = invitationCard(alice, title);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: "Dismiss" }).click();
  await expect(card).not.toBeVisible({ timeout: 20_000 });
});

test("invitee reports an invitation", async ({
  authedPage: alice,
  bobPage: bob,
}) => {
  const title = uniqueName("Spam event");
  await inviteAlice(bob, { date: futureDate(22), title });

  await navigate(alice, "/notifications");
  const card = invitationCard(alice, title);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: "Report this event" }).click();

  const dialog = alice.getByRole("dialog", { name: "Report Event" });
  await dialog.getByRole("combobox").click();
  await alice.getByRole("option", { name: "Spam" }).click();
  await dialog.getByRole("button", { name: "Submit Report" }).click();

  await expect(card).not.toBeVisible({ timeout: 20_000 });
});

test("participant ignores an accepted invitation via the delete dialog", async ({
  authedPage: alice,
  bobPage: bob,
}) => {
  const title = uniqueName("Second thoughts");
  const date = futureDate(23);
  await inviteAlice(bob, { date, title });

  // Accept first so the event is on Alice's grid.
  await navigate(alice, "/notifications");
  const card = invitationCard(alice, title);
  await expect(card).toBeVisible({ timeout: 30_000 });
  await card.getByRole("button", { name: "Add to Calendar" }).click();
  const addDialog = alice.getByRole("dialog", { name: "Add to Calendar" });
  await addDialog.getByTestId("calendar-list-select").click();
  await alice.getByRole("option", { name: "Add new calendar" }).click();
  const calendarDialog = alice.getByRole("dialog", { name: "New Calendar" });
  await calendarDialog.getByLabel("Calendar Name").fill(uniqueName("Ignore"));
  await calendarDialog.getByRole("button", { name: "Create" }).click();
  await addDialog.getByRole("button", { name: "Add", exact: true }).click();

  await gotoDay(alice, date);
  await expect(alice.getByText(title)).toBeVisible({ timeout: 20_000 });

  // Now opt out as a participant: delete dialog → "Ignore invitation".
  const modal = await openEventModal(alice, title);
  await modal.getByRole("button", { name: "More options" }).click();
  await alice.getByRole("menuitem", { name: "Delete Event" }).click();
  const deleteDialog = alice
    .getByRole("dialog")
    .filter({ hasText: "Delete Event" });
  await deleteDialog.getByTestId("delete-option-ignore").click();
  await deleteDialog.getByRole("button", { name: "Confirm" }).click();

  await expect(deleteDialog).not.toBeVisible({ timeout: 20_000 });
  await expect(alice.getByText(title)).not.toBeVisible();
});
