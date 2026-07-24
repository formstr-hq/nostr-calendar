import { test, expect } from "../fixtures/index.js";
import { navigate } from "../fixtures/index.js";

test("home path redirects to the current week", async ({
  authedPage: page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/w\/\d{4}\/\d{1,2}$/);
});

test("view switcher switches between day, week and month views", async ({
  authedPage: page,
}) => {
  // Starts on the week view (home redirect).
  await page.getByRole("radio", { name: "Day", exact: true }).click();
  await expect(page).toHaveURL(/\/d\/\d{4}\/\d{1,2}\/\d{1,2}$/);

  await page.getByRole("radio", { name: "Month", exact: true }).click();
  await expect(page).toHaveURL(/\/m\/\d{4}\/\d{1,2}$/);

  await page.getByRole("radio", { name: "Week", exact: true }).click();
  await expect(page).toHaveURL(/\/w\/\d{4}\/\d{1,2}$/);
});

test("prev / next / today navigate the month view", async ({
  authedPage: page,
}) => {
  const dateLabel = page.getByTestId("topbar-date-label");

  await navigate(page, "/m/2026/7");
  await expect(dateLabel).toHaveText("July 2026");

  await page.getByRole("button", { name: "next period" }).click();
  await expect(dateLabel).toHaveText("August 2026");

  await page.getByRole("button", { name: "previous period" }).click();
  await expect(dateLabel).toHaveText("July 2026");
  await page.getByRole("button", { name: "previous period" }).click();
  await expect(dateLabel).toHaveText("June 2026");

  // The "today" button jumps back to the current month.
  const now = new Date();
  const currentMonthLabel = now.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  await page.getByRole("button", { name: "go to today" }).click();
  await expect(dateLabel).toHaveText(currentMonthLabel);
  await expect(page).toHaveURL(
    new RegExp(`/m/${now.getFullYear()}/${now.getMonth() + 1}$`),
  );
});

test("deep links open the right view and date", async ({
  authedPage: page,
}) => {
  const dateLabel = page.getByTestId("topbar-date-label");

  await navigate(page, "/d/2026/7/20");
  await expect(dateLabel).toHaveText("Jul 20, 2026");

  await navigate(page, "/m/2026/12");
  await expect(dateLabel).toHaveText("December 2026");
});

test("sidebar mini calendar navigates to the picked date", async ({
  authedPage: page,
}) => {
  const dateLabel = page.getByTestId("topbar-date-label");

  await navigate(page, "/d/2026/7/10");
  await expect(dateLabel).toHaveText("Jul 10, 2026");

  // The desktop Sidebar is always present — no drawer to open.
  await page.getByRole("gridcell", { name: "20", exact: true }).first().click();

  await expect(dateLabel).toHaveText("Jul 20, 2026");
});
