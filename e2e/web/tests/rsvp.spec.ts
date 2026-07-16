import { test, expect, navigate } from "../fixtures/index.js";
import { TEST_KEYS } from "../../relay/seed/keys.js";
import {
  createCalendarViaSidebar,
  createInviteEvent,
  futureDate,
  uniqueName,
} from "../helpers.js";
import type { Page } from "@playwright/test";

// Alice authors a private event with Bob as participant. Bob opens the
// shared event link, adds it to a calendar (RespondPanel) and RSVPs.

async function acceptIntoNewCalendar(page: Page, eventUrl: string) {
  // The respond panel needs at least one calendar to offer its picker.
  await navigate(page, "/", TEST_KEYS.bob);
  await createCalendarViaSidebar(page, uniqueName("RSVP cal"));

  await navigate(page, eventUrl, TEST_KEYS.bob);
  await page.getByRole("button", { name: "Add to Calendar" }).click();
  // Once the event is in a calendar the RSVP bar replaces the respond panel.
  await expect(page.getByText("Will you be attending?")).toBeVisible({
    timeout: 20_000,
  });
}

test("participant RSVPs yes, then changes to no", async ({
  authedPage: alice,
  bobPage: bob,
}) => {
  const title = uniqueName("RSVP party");
  const eventUrl = await createInviteEvent(alice, {
    date: futureDate(30),
    title,
    calendarName: uniqueName("Host cal"),
    participantNpub: TEST_KEYS.bob.npub,
  });

  await acceptIntoNewCalendar(bob, eventUrl);

  await bob.getByTestId("rsvp-yes").click();
  // The chosen status renders as a contained (filled) button.
  await expect(bob.getByTestId("rsvp-yes")).toHaveClass(/MuiButton-contained/, {
    timeout: 20_000,
  });

  await bob.getByTestId("rsvp-no").click();
  await expect(bob.getByTestId("rsvp-no")).toHaveClass(/MuiButton-contained/, {
    timeout: 20_000,
  });
  await expect(bob.getByTestId("rsvp-yes")).not.toHaveClass(
    /MuiButton-contained/,
  );
});

test("participant adds a note the host can read", async ({
  authedPage: alice,
  bobPage: bob,
}) => {
  const title = uniqueName("Note event");
  const date = futureDate(31);
  const note = `Running late! ${Date.now()}`;
  const eventUrl = await createInviteEvent(alice, {
    date,
    title,
    calendarName: uniqueName("Host cal"),
    participantNpub: TEST_KEYS.bob.npub,
  });

  await acceptIntoNewCalendar(bob, eventUrl);

  // Saving a note submits the RSVP (defaults to "maybe" when no status was
  // picked). A single submit avoids two replaceable events sharing the same
  // created_at second, where the relay would drop the later one.
  await bob.getByText("Add a note").click();
  await bob.getByLabel("Comment").fill(note);
  await bob.getByRole("button", { name: "Save", exact: true }).click();
  await expect(bob.getByTestId("rsvp-maybe")).toHaveClass(
    /MuiButton-contained/,
    { timeout: 20_000 },
  );

  // Alice sees Bob's comment in the participant list. The RSVP record
  // arrives via relay subscription — reload until it shows up.
  await expect(async () => {
    await navigate(alice, eventUrl);
    await expect(
      alice.getByRole("button", { name: "view comment" }),
    ).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await alice.getByRole("button", { name: "view comment" }).click();
  await expect(alice.getByText(note)).toBeVisible({ timeout: 20_000 });
});

test("host applies a participant's suggested time", async ({
  authedPage: alice,
  bobPage: bob,
}) => {
  const title = uniqueName("Reschedule me");
  const date = futureDate(32);
  const eventUrl = await createInviteEvent(alice, {
    date,
    title,
    calendarName: uniqueName("Host cal"),
    participantNpub: TEST_KEYS.bob.npub,
  });

  await acceptIntoNewCalendar(bob, eventUrl);

  // Bob suggests moving the event to 14:00–15:00 on the same day.
  await bob.getByText("Can't attend at this time?").click();
  await bob.getByLabel("Suggested start").fill(`${date}T14:00`);
  await bob.getByLabel("Suggested end").fill(`${date}T15:00`);
  await bob.getByRole("button", { name: "Save", exact: true }).first().click();

  // Alice sees the suggestion and applies it (reload until the RSVP record
  // arrives from the relay).
  await expect(async () => {
    await navigate(alice, eventUrl);
    await expect(
      alice.getByRole("button", { name: "view suggested time" }),
    ).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  await alice.getByRole("button", { name: "view suggested time" }).click();
  const applyButton = alice.getByRole("button", {
    name: "Move event to this time",
  });
  await expect(applyButton).toBeVisible({ timeout: 20_000 });
  await applyButton.click();
  // The button disables while the move publishes, then the in-view event stays
  // stale — wait for the publish round-trip before reloading.
  await expect(applyButton).toBeEnabled({ timeout: 20_000 });

  // After the move is published, the suggestion matches the event's own time
  // so the suggestion indicator is gone on a fresh load.
  await navigate(alice, eventUrl);
  await expect(alice.getByText(title)).toBeVisible({ timeout: 20_000 });
  await expect(
    alice.getByRole("button", { name: "view suggested time" }),
  ).not.toBeVisible();
});
