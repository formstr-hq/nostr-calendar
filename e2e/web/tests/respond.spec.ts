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

// Note: the respond panel's logged-out "Continue as Guest" branch is
// currently unreachable on web — routes only render for logged-in users and
// the login modal cannot be dismissed. What a logged-out visitor actually
// gets on an event link is the login gate:
test("logged-out visitor hits the login gate on a shared event link", async ({
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

  const loginDialog = page.getByRole("dialog");
  await expect(loginDialog).toBeVisible();
  await expect(loginDialog.getByText("Sign in to Calendar")).toBeVisible();
  // The event itself is not rendered while logged out.
  await expect(page.getByText(title)).not.toBeVisible();

  await context.close();
});
