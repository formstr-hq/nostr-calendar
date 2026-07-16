import { test, expect } from "../fixtures/index.js";
import { navigate } from "../fixtures/index.js";

test("home path redirects to the current week", async ({ authedPage: page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/w\/\d{4}\/\d{1,2}$/);
});

test("layout menu switches between day, week and month views", async ({
  authedPage: page,
}) => {
  // Starts on the week view (home redirect). exact: true — "go to today"
  // would otherwise substring-match "Day".
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await page.getByRole("menuitem", { name: "Day", exact: true }).click();
  await expect(page).toHaveURL(/\/d\/\d{4}\/\d{1,2}\/\d{1,2}$/);

  await page.getByRole("button", { name: "Day", exact: true }).click();
  await page.getByRole("menuitem", { name: "Month", exact: true }).click();
  await expect(page).toHaveURL(/\/m\/\d{4}\/\d{1,2}$/);

  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByRole("menuitem", { name: "Week", exact: true }).click();
  await expect(page).toHaveURL(/\/w\/\d{4}\/\d{1,2}$/);
});

test("prev / next / today navigate the month view", async ({
  authedPage: page,
}) => {
  await navigate(page, "/m/2026/7");
  await expect(page.getByText("July 2026")).toBeVisible();

  await page.getByRole("button", { name: "next period" }).click();
  await expect(page.getByText("August 2026")).toBeVisible();

  await page.getByRole("button", { name: "previous period" }).click();
  await page.getByRole("button", { name: "previous period" }).click();
  await expect(page.getByText("June 2026")).toBeVisible();

  // The "today" button jumps back to the current month.
  const now = new Date();
  const currentMonthLabel = now.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
  await page.getByRole("button", { name: "go to today" }).click();
  await expect(page.getByText(currentMonthLabel)).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`/m/${now.getFullYear()}/${now.getMonth() + 1}$`),
  );
});

test("deep links open the right view and date", async ({
  authedPage: page,
}) => {
  await navigate(page, "/d/2026/7/20");
  await expect(page.getByText("Jul 20, 2026")).toBeVisible();

  await navigate(page, "/m/2026/12");
  await expect(page.getByText("December 2026")).toBeVisible();
});

test("sidebar date picker navigates to the picked date", async ({
  authedPage: page,
}) => {
  await navigate(page, "/d/2026/7/10");
  await expect(page.getByText("Jul 10, 2026")).toBeVisible();
  await page.getByRole("button", { name: "open menu" }).last().click();

  // Pick a day in the sidebar's mini calendar — it navigates and closes the drawer.
  const drawer = page.getByRole("presentation");
  await drawer.getByRole("gridcell", { name: "20", exact: true }).first().click();

  await expect(page.getByText("Jul 20, 2026")).toBeVisible();
});
