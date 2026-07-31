import { test, expect, navigate } from "../fixtures/index.js";

// Runs only in the "mobile" Playwright project (Pixel 7 viewport, touch).
// Swipe-gesture navigation is intentionally not covered here — framer-motion
// drag doesn't respond to Playwright's synthetic pointer input reliably.

test("mobile day view hides desktop navigation arrows", async ({
  authedPage: page,
}) => {
  await navigate(page, "/d/2026/7/20");
  await expect(page.getByTestId("topbar-date-label")).toHaveText(
    "Mon, Jul 20, 2026",
  );

  // Prev/next arrows are desktop-only — mobile navigates by swiping.
  await expect(
    page.getByRole("button", { name: "previous period" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "next period" })).toHaveCount(
    0,
  );

  // View switching still works on mobile.
  await page.getByRole("radio", { name: "Month", exact: true }).click();
  await expect(page).toHaveURL(/\/m\/2026\/7$/);
});

test("native iOS keeps app chrome fixed and input text at 16px", async ({
  authedPage: page,
}) => {
  await navigate(page, "/d/2026/7/20");
  await page.locator("html").evaluate((html) => {
    html.classList.add("ios-native");
  });

  const layout = await page.evaluate(() => {
    const main = document.querySelector("main")!;
    const dateLabel = document.querySelector(
      '[data-testid="topbar-date-label"]',
    )!;
    const tabBar = document.querySelector("nav")!;
    const before = {
      mainTop: main.getBoundingClientRect().top,
      headerTop: dateLabel.getBoundingClientRect().top,
      footerBottom: tabBar.getBoundingClientRect().bottom,
    };
    main.scrollTop = 300;
    const after = {
      mainTop: main.getBoundingClientRect().top,
      headerTop: dateLabel.getBoundingClientRect().top,
      footerBottom: tabBar.getBoundingClientRect().bottom,
    };

    return {
      scrollable: main.scrollHeight > main.clientHeight,
      overflowY: getComputedStyle(main).overflowY,
      before,
      after,
    };
  });

  expect(layout.scrollable).toBe(true);
  expect(layout.overflowY).toBe("auto");
  expect(layout.after).toEqual(layout.before);

  await page.getByRole("button", { name: "Open calendars" }).click();
  await page.getByRole("button", { name: /New event/ }).click();
  await expect(page.getByTestId("event-title")).toHaveCSS("font-size", "16px");
});

test("mobile day view navigates to the next day on a left swipe", async ({
  authedPage: page,
}) => {
  await navigate(page, "/d/2026/7/20");

  await page
    .getByTestId("day-hour-cell")
    .first()
    .evaluate((cell) => {
      const touch = (x: number) =>
        new Touch({
          identifier: 1,
          target: cell,
          clientX: x,
          clientY: 200,
        });
      cell.dispatchEvent(
        new TouchEvent("touchstart", {
          bubbles: true,
          touches: [touch(300)],
          changedTouches: [touch(300)],
        }),
      );
      cell.dispatchEvent(
        new TouchEvent("touchend", {
          bubbles: true,
          changedTouches: [touch(100)],
        }),
      );
    });

  await expect(page).toHaveURL(/\/d\/2026\/7\/21$/);
});

test("mobile calendars bottom sheet opens and closes", async ({
  authedPage: page,
}) => {
  await page.getByRole("button", { name: "Open calendars" }).click();
  await expect(page.getByText("Calendars", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByText("Calendars", { exact: true })).not.toBeVisible();
});

test("mobile settings panel collapses and navigates sections", async ({
  authedPage: page,
}) => {
  await page.goto("/settings/general");
  await page.getByRole("button", { name: "General", exact: true }).click();
  await page
    .getByRole("button", { name: "Relays & sync", exact: true })
    .click();
  await expect(page).toHaveURL(/\/settings\/relays$/);
  await expect(
    page.getByRole("heading", { name: "Relays & sync" }),
  ).toBeVisible();
});
