import { expect, test } from "./support/fixtures";
import { navRow, screen } from "./support/team-nav";

/**
 * The navigation stack's browser-history sync: the app
 * has no router, but every screen-level move mirrors into `history`, so the
 * browser's back/forward buttons (and Android's hardware back, covered by the
 * mobile project) walk the app instead of leaving it.
 */

test("browser back and forward walk the app's screens", async ({ page }) => {
  await page.goto("/");
  // Boot's Inbox→home redirect REPLACES, so the stack starts on the board.
  await expect(screen(page)).toHaveAttribute("data-screen", "team");

  await navRow(page, "inbox").click();
  await expect(screen(page)).toHaveAttribute("data-screen", "inbox");
  await navRow(page, "settings").click();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");

  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "inbox");
  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "team");

  await page.goForward();
  await expect(screen(page)).toHaveAttribute("data-screen", "inbox");
});

test("browser back closes the chat panel before leaving the board", async ({
  page,
}) => {
  await page.goto("/");
  await screen(page).getByText("Plan a trip to Tokyo").click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("mission-panel")).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "team");
  // The board itself is still on the glass, not blanked by the pop.
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
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
  await expect(screen(page)).toHaveAttribute("data-screen", "team");
});

test("a reload re-boots to a single-entry stack and keeps navigating", async ({
  page,
}) => {
  await page.goto("/");
  await navRow(page, "inbox").click();
  await expect(screen(page)).toHaveAttribute("data-screen", "inbox");

  // viewMode is deliberately not persisted: a refresh lands back on home
  // with a fresh one-entry stack — and navigation still works from there.
  await page.reload();
  await expect(screen(page)).toHaveAttribute("data-screen", "team");
  await navRow(page, "settings").click();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "team");
});
