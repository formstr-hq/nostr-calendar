import { test, expect } from "../fixtures/index.js";
import { navigate } from "../fixtures/index.js";

test("home path redirects to the current week", async ({
  authedPage: page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/w\/\d{4}\/\d{1,3}$/);
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
  await expect(page).toHaveURL(/\/w\/\d{4}\/\d{1,3}$/);
});

async function setWeekStart(
  page: Parameters<typeof navigate>[0],
  weekStart: "Monday" | "Sunday" | "Saturday",
) {
  await navigate(page, "/settings/general");
  await page.getByLabel("Start week on").click();
  await page.getByRole("option", { name: weekStart }).click();
  await expect(page.getByLabel("Start week on")).toHaveText(weekStart);
}

test("today uses Monday as the week route start", async ({
  authedPage: page,
}) => {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const startOfYear = new Date(monday.getFullYear(), 0, 1);
  const dayOfYear =
    Math.floor((monday.getTime() - startOfYear.getTime()) / 86_400_000) + 1;

  await setWeekStart(page, "Monday");
  await navigate(page, "/w/2026/5");
  await page.getByRole("button", { name: "go to today" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/w/${monday.getFullYear()}/${dayOfYear}$`),
  );
});

test("Sunday week navigation advances using Sunday starts", async ({
  authedPage: page,
}) => {
  await setWeekStart(page, "Sunday");
  await navigate(page, "/w/2026/4");

  await page.getByRole("button", { name: "next period" }).click();
  await expect(page).toHaveURL(/\/w\/2026\/11$/);

  await page.getByRole("button", { name: "previous period" }).click();
  await expect(page).toHaveURL(/\/w\/2026\/4$/);
});

test("Saturday weeks navigate over the year boundary", async ({
  authedPage: page,
}) => {
  await setWeekStart(page, "Saturday");
  await navigate(page, "/w/2026/3");

  await page.getByRole("button", { name: "previous period" }).click();
  await expect(page).toHaveURL(/\/w\/2025\/361$/);

  await page.getByRole("button", { name: "next period" }).click();
  await expect(page).toHaveURL(/\/w\/2026\/3$/);
  await page.getByRole("button", { name: "next period" }).click();
  await expect(page).toHaveURL(/\/w\/2026\/10$/);
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
