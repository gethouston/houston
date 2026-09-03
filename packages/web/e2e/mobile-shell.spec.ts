import { expect, test } from "./support/fixtures";
import { moreMenu, moreRow, navBar, navItem } from "./support/mobile-nav";
import { screen } from "./support/team-nav";

/**
 * Mobile layout (<768px): the fixed sidebar rail is replaced by a floating nav
 * bar whose More button raises the rail's long tail as a card, the mission
 * chat covers the full content area instead of splitting it 55/45, and nothing
 * forces the document wider than the viewport. Runs at iPhone-class logical
 * resolution in the desktop-chromium project, so it also pins the breakpoint
 * itself: the same page at 1280px is the desktop shell again.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("replaces the sidebar rail with the floating nav bar", async ({
  page,
}) => {
  await page.goto("/");

  // No rail, and no hamburger to open one: the bar IS the navigation.
  await expect(navBar(page)).toBeVisible();
  await expect(page.locator('[data-tour-target="sidebar"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);

  for (const tab of ["agents", "teams", "more"] as const) {
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
  // The rail's own rows, by the rail's own anchors — one destination list for
  // both breakpoints.
  for (const anchor of [
    "nav-inbox",
    "nav-agent-store",
    "nav-integrations",
    "nav-ai-hub",
    "nav-skills",
    "nav-settings",
  ]) {
    await expect(moreRow(page, anchor)).toHaveCount(1);
  }

  // Navigating from the menu closes it so the content is visible again.
  await moreRow(page, "nav-inbox").click();
  await expect(menu).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "inbox");
});

test("keeps the document free of horizontal overflow", async ({ page }) => {
  await page.goto("/");
  // The Agents home's rows are one line each (no task preview), so the boot
  // anchor is the agent row itself.
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

  // The phone lands on the Agents home: drill agent → mission to the chat,
  // pushed as its own full-screen level.
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
  // The phone has no gutter frame at all now: the chat is the whole width.
  expect(box?.width ?? 0).toBe(390);

  // The chat's back chevron pops the push, landing where it came from.
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
  // CSS-hidden at md+ rather than unmounted, so the bar reappears on resize
  // with no re-render flicker.
  await expect(navBar(page)).toBeHidden();
});
