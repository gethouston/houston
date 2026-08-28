import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

/**
 * Hardware/browser back on a phone: on Android
 * (and in an installed PWA) back is the primary way out of a screen, so it
 * must pop the app's navigation stack — here the full-screen chat overlay —
 * instead of leaving the app.
 */

test("back closes the full-screen chat instead of leaving the app", async ({
  page,
}) => {
  await page.goto("/");
  // Reach the chat the way the phone does: Agents home → the agent's
  // missions → the mission.
  await page.getByTestId("agents-home-row").tap();
  await page
    .getByTestId("agent-missions-screen")
    .getByText("Plan a trip to Tokyo")
    .tap();
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("mission-panel")).toBeHidden();
  // Still in the app, on the board the chat covered.
  await expect(screen(page)).toHaveAttribute("data-screen", "team");
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
});
