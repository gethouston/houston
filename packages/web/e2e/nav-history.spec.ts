import { expect, test } from "./support/fixtures";
import { missionCard, screen } from "./support/team-nav";
import { openNavRow } from "./support/workspace-menu";

test("browser back and forward walk the app's screens", async ({ page }) => {
  await page.goto("/");
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");

  await openNavRow(page, "ai-hub");
  await expect(screen(page)).toHaveAttribute("data-screen", "ai-hub");
  await openNavRow(page, "settings");
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
  await missionCard(page, "Plan a trip to Tokyo").click();
  await expect(page.getByTestId("mission-panel")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("mission-panel")).toBeHidden();
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();
});

test("browser back retreats a Settings drill-in to the index", async ({
  page,
}) => {
  await page.goto("/");
  await openNavRow(page, "settings");
  await screen(page).getByText("Keyboard shortcuts").click();
  await expect(
    screen(page).getByRole("button", { name: "Settings" }),
  ).toBeVisible();

  await page.goBack();
  await expect(screen(page).getByText("Keyboard shortcuts")).toBeVisible();
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");

  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");
});

test("a reload re-boots to a single-entry stack and keeps navigating", async ({
  page,
}) => {
  await page.goto("/");
  await openNavRow(page, "ai-hub");
  await expect(screen(page)).toHaveAttribute("data-screen", "ai-hub");

  await page.reload();
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");
  await openNavRow(page, "settings");
  await expect(screen(page)).toHaveAttribute("data-screen", "settings");
  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");
});
