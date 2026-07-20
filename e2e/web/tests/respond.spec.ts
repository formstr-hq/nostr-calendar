import { test, expect, navigate } from "../fixtures/index.js";
import { TEST_KEYS } from "../../relay/seed/keys.js";
import {
  createCalendarViaSidebar,
  createInviteEvent,
  futureDate,
  uniqueName,
} from "../helpers.js";

// The respond panel shows on an event page when the event is not in any of
// the viewer's calendars.

test("logged-in visitor accepts a shared event into a calendar", async ({
  authedPage: alice,
  bobPage: bob,
}) => {
  const title = uniqueName("Shared event");
  const eventUrl = await createInviteEvent(alice, {
    date: futureDate(35),
    title,
    calendarName: uniqueName("Share cal"),
    participantNpub: TEST_KEYS.bob.npub,
  });

  // The respond panel's picker only renders for users with ≥1 calendar.
  await navigate(bob, "/", TEST_KEYS.bob);
  await createCalendarViaSidebar(bob, uniqueName("Respond cal"));

  await navigate(bob, eventUrl, TEST_KEYS.bob);
  await expect(bob.getByText(title)).toBeVisible({ timeout: 20_000 });

  // Not in any of Bob's calendars yet → respond panel with a calendar picker.
  await bob.getByRole("button", { name: "Add to Calendar" }).click();

  // Accepted: the RSVP bar replaces the respond panel.
  await expect(bob.getByText("Will you be attending?")).toBeVisible({
    timeout: 20_000,
  });
});

// Shared event links are a public route: the event renders standalone (no
// app chrome, no blocking login modal) so a logged-out visitor can see what
// they were invited to. Adding it to a calendar still requires signing in
// or continuing as a guest, offered inline by the respond panel.
test("logged-out visitor sees a login/guest prompt on a shared event link", async ({
  authedPage: alice,
  browser,
}) => {
  const title = uniqueName("Gated event");
  const eventUrl = await createInviteEvent(alice, {
    date: futureDate(36),
    title,
    calendarName: uniqueName("Guest cal"),
    participantNpub: TEST_KEYS.bob.npub,
  });

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(eventUrl);

  // The event itself renders for a logged-out visitor.
  await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });

  // No blocking login dialog — the respond panel offers login/guest inline.
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByText("Log in to add this event to your calendar"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Login with Nostr" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue as Guest" }),
  ).toBeVisible();

  await context.close();
});
