import { test, expect, navigate } from "../fixtures/index.js";
import {
  bookFirstSlot,
  createBookingPage,
  createCalendarViaSelect,
  openBookingsViaSidebar,
} from "../helpers.js";

// Creating a scheduling page also rewrites the shared per-user key index
// (kind 32680) with a fetch-modify-write, so concurrent page creations from
// parallel workers can drop each other's keys. Run these tests sequentially
// in one worker instead.
test.describe.configure({ mode: "default" });

// Unique suffix so retries / repeated runs against the same relay don't
// produce ambiguous cards on the bookings page.
const runId = Date.now().toString(36);

test("user creates a booking link and edits it", async ({
  authedPage: page,
}) => {
  // Create from the bookings page.
  await navigate(page, "/bookings");
  await page.getByRole("button", { name: "New Page" }).click();
  await page.waitForURL("**/schedule/create");

  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Office Hours");
  await page.getByRole("button", { name: "Create page" }).click();
  await page.waitForURL("**/schedule/edit/naddr*", { timeout: 20_000 });

  // The shareable link (with viewKey) is displayed after saving.
  const pageUrl = await page.getByLabel("booking page link").inputValue();
  expect(pageUrl).toContain("/schedule/naddr");
  expect(pageUrl).toContain("viewKey=");
  const naddr = new URL(pageUrl).pathname.split("/schedule/")[1];

  // Edit the page: rename it and open up Saturdays.
  await navigate(page, `/schedule/edit/${naddr}`);
  const titleField = page.getByRole("textbox", { name: "Title", exact: true });
  await expect(titleField).toHaveValue("Office Hours", { timeout: 30_000 });

  await titleField.fill("Office Hours v2");
  await page.getByRole("checkbox", { name: "Saturday" }).check();
  await page.getByRole("button", { name: "Edit page" }).click();
  await expect(page.getByText("Scheduling page updated!")).toBeVisible({
    timeout: 20_000,
  });

  // Reload the editor to confirm the changes persisted on the relay.
  await navigate(page, `/schedule/edit/${naddr}`);
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Office Hours v2", { timeout: 30_000 });
  await expect(page.getByRole("checkbox", { name: "Saturday" })).toBeChecked();
});

test("booker requests a slot and the host approves it", async ({
  authedPage: alice,
  bobPage: bob,
}) => {
  const meetingTitle = `Approval Meeting ${runId}`;

  const pageUrl = await createBookingPage(alice, `Approve Flow ${runId}`);
  // Opening the inbox starts the host's live booking-request subscription.
  // The redesigned app loads this lazily with the booking UI rather than at
  // authentication time.
  await openBookingsViaSidebar(alice);
  await bookFirstSlot(bob, pageUrl, meetingTitle, "Bob Approve Calendar");

  // Host reviews and approves the incoming request.
  await openBookingsViaSidebar(alice);
  const requestCard = alice
    .getByTestId("booking-request-card")
    .filter({ hasText: meetingTitle });
  await expect(requestCard).toBeVisible({ timeout: 30_000 });
  await requestCard.click();
  await createCalendarViaSelect(alice, alice, "Alice Approve Calendar");
  await alice.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(
    requestCard.getByText("approved", { exact: true }),
  ).toBeVisible();

  // Booker sees the approval in their Outgoing tab.
  await openBookingsViaSidebar(bob);
  await bob.getByRole("radio", { name: "Outgoing" }).click();
  const sentCard = bob
    .getByTestId("booking-request-card")
    .filter({ hasText: meetingTitle });
  await expect(sentCard).toBeVisible();
  await expect(sentCard.getByText("approved", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});

test("booker requests a slot and the host declines it with a reason", async ({
  authedPage: alice,
  bobPage: bob,
}) => {
  const meetingTitle = `Decline Meeting ${runId}`;
  const declineReason = "Out of office that day";

  const pageUrl = await createBookingPage(alice, `Decline Flow ${runId}`);
  // See the approval flow above: establish the host's live subscription
  // before the booker sends a request.
  await openBookingsViaSidebar(alice);
  await bookFirstSlot(bob, pageUrl, meetingTitle, "Bob Decline Calendar");

  // Host reviews and declines the incoming request.
  await openBookingsViaSidebar(alice);
  const requestCard = alice
    .getByTestId("booking-request-card")
    .filter({ hasText: meetingTitle });
  await expect(requestCard).toBeVisible({ timeout: 30_000 });
  await requestCard.click();
  await alice.getByLabel("Decline reason (optional)").fill(declineReason);
  await alice.getByRole("button", { name: "Decline", exact: true }).click();
  await expect(
    requestCard.getByText("declined", { exact: true }),
  ).toBeVisible();

  // Booker sees the decline in their Outgoing tab.
  await openBookingsViaSidebar(bob);
  await bob.getByRole("radio", { name: "Outgoing" }).click();
  const sentCard = bob
    .getByTestId("booking-request-card")
    .filter({ hasText: meetingTitle });
  await expect(sentCard).toBeVisible();
  await expect(sentCard.getByText("declined", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});
