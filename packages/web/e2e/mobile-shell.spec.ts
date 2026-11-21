import { expect, test } from "./support/fixtures";
import { moreMenu, moreRow, navBar, navItem } from "./support/mobile-nav";
import { screen } from "./support/team-nav";

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("replaces the sidebar rail with the floating nav bar", async ({
  page,
}) => {
  await page.goto("/");

  await expect(navBar(page)).toBeVisible();
  await expect(page.locator('[data-tour-target="sidebar"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);

  for (const tab of ["agents", "more"] as const) {
    await expect(navItem(page, tab)).toBeVisible();
  }
});

test("the More menu carries the rail's destinations and closes on navigation", async ({
  page,
}) => {
  await page.goto("/");

  await navItem(page, "more").click();
  const menu = moreMenu(page);
  await expect(menu).toBeVisible();
  for (const anchor of [
    "nav-integrations",
    "nav-ai-hub",
    "nav-academy",
    "nav-settings",
  ]) {
    await expect(moreRow(page, anchor)).toHaveCount(1);
  }

  await moreRow(page, "nav-integrations").click();
  await expect(menu).toBeHidden();
  await expect(screen(page)).toHaveAttribute(
    "data-screen",
    "integrations-home",
  );
});

test("keeps the document free of horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("agents-home-row")).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("opens a mission's chat covering the full content width", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("agents-home-row").click();
  await page
    .getByTestId("agent-missions-screen")
    .getByText("Plan a trip to Tokyo")
    .click();
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  const chat = page.getByTestId("mission-chat-screen");
  await expect(chat).toBeVisible();
  const box = await chat.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBe(390);

  await page.getByTestId("mission-chat-back").click();
  await expect(chat).toHaveCount(0);
  await expect(
    screen(page).getByText("Plan a trip to Tokyo").first(),
  ).toBeVisible();
});

test("the nav bar stays hidden on a desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await expect(page.locator('[data-tour-target="sidebar"]')).toBeVisible();
  await expect(navBar(page)).toBeHidden();
});
