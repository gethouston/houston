import { expect, test } from "./support/fixtures";

/**
 * Mobile layout (<768px, HOU-1014): the fixed sidebar rail is replaced by a
 * hamburger-opened Sheet drawer, the mission detail panel covers the full
 * content area instead of splitting it 55/45, and nothing forces the document
 * wider than the viewport. Runs at iPhone-class logical resolution.
 */

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
});

test("replaces the sidebar rail with a hamburger drawer", async ({ page }) => {
  await page.goto("/");

  // No fixed rail on mobile; the hamburger is the sidebar affordance.
  const hamburger = page.getByRole("button", { name: "Open menu" });
  await expect(hamburger).toBeVisible();
  await expect(page.locator('[data-tour-target="sidebar"]')).toHaveCount(0);

  await hamburger.click();
  const drawer = page.locator('[data-slot="sheet-content"]');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('[data-tour-target="sidebar"]')).toBeVisible();

  // Navigating from the drawer closes it so the content is visible again.
  await drawer.locator("[data-tour-target='nav-inbox']").click();
  await expect(drawer).toBeHidden();
});

test("keeps the document free of horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();

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

  await page.getByText("Plan a trip to Tokyo").click();
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  const panel = page.getByTestId("mission-panel");
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box).not.toBeNull();
  // Full width minus the 8px gutter frame on each side (not a 45% split).
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(360);

  // The panel's own close button returns to the board.
  await page.getByRole("button", { name: "Close panel" }).click();
  await expect(panel).toBeHidden();
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
});

test("the hamburger stays hidden on a desktop viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  await expect(page.locator('[data-tour-target="sidebar"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeHidden();
});
