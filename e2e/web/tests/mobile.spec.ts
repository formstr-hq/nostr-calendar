import { test, expect, navigate } from "../fixtures/index.js";

// Runs only in the "mobile" Playwright project (Pixel 7 viewport, touch).
// Swipe-gesture navigation is intentionally not covered here — framer-motion
// drag doesn't respond to Playwright's synthetic pointer input reliably.

test("mobile day view hides desktop navigation arrows", async ({
  authedPage: page,
}) => {
  await navigate(page, "/d/2026/7/20");
  await expect(page.getByText("Jul 20, 2026")).toBeVisible();

  // Prev/next arrows are desktop-only — mobile navigates by swiping.
  await expect(
    page.getByRole("button", { name: "previous period" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "next period" })).toHaveCount(
    0,
  );

  // Layout switching still works on mobile.
  await page.getByRole("button", { name: "Day", exact: true }).click();
  await page.getByRole("menuitem", { name: "Month", exact: true }).click();
  await expect(page).toHaveURL(/\/m\/2026\/7$/);
});

test("mobile sidebar drawer opens and closes", async ({ authedPage: page }) => {
  await page.getByRole("button", { name: "open menu" }).last().click();
  await expect(page.getByText("Calendars", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText("Calendars", { exact: true })).not.toBeVisible();
});
