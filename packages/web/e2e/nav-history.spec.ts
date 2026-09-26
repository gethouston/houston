import { expect, test } from "./support/fixtures";
import { missionCard, navRow, screen } from "./support/team-nav";

/**
 * The navigation stack's browser-history sync: the app
 * has no router, but every screen-level move mirrors into `history`, so the
 * browser's back/forward buttons (and Android's hardware back, covered by the
 * mobile project) walk the app instead of leaving it.
 */

test("browser back and forward walk the app's screens", async ({ page }) => {
  await page.goto("/");
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");

  await navRow(page, "ai-hub").click();
  await expect(screen(page)).toHaveAttribute("data-screen", "ai-hub");
  await navRow(page, "settings").click();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");

  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "ai-hub");
  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");

  await page.goForward();
  await expect(screen(page)).toHaveAttribute("data-screen", "ai-hub");
});

test("browser back closes the chat panel before leaving the board", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("[data-sidebar-item]")
    .first()
    .getByRole("button")
    .first()
    .click();
  // The kanban card belongs to the selected employee's Tasks screen.
  await missionCard(page, "Plan a trip to Tokyo").click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("mission-panel")).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");
  // The board itself is still on the glass, not blanked by the pop.
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();
});

test("browser back retreats a Settings drill-in to the index", async ({
  page,
}) => {
  await page.goto("/");
  await navRow(page, "settings").click();
  await screen(page).getByText("Keyboard shortcuts").click();
  await expect(
    screen(page).getByRole("button", { name: "Settings" }),
  ).toBeVisible();

  await page.goBack();
  // Back on the index: the drill-in rows are the screen again.
  await expect(screen(page).getByText("Keyboard shortcuts")).toBeVisible();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");

  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");
});

test("a reload re-boots to a single-entry stack and keeps navigating", async ({
  page,
}) => {
  await page.goto("/");
  await navRow(page, "ai-hub").click();
  await expect(screen(page)).toHaveAttribute("data-screen", "ai-hub");

  // viewMode is deliberately not persisted: a refresh lands back on home
  // with a fresh one-entry stack — and navigation still works from there.
  await page.reload();
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");
  await navRow(page, "settings").click();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");
});
