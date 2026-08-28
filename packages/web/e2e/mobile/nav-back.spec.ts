import { expect, test } from "../support/fixtures";
import { screen } from "../support/team-nav";

/**
 * Hardware/browser back on a phone: on Android
 * (and in an installed PWA) back is the primary way out of a screen, so it
 * must pop the app's navigation stack — here the pushed mission-chat
 * screen — instead of leaving the app.
 */

test("back closes the pushed chat instead of leaving the app", async ({
  page,
}) => {
  await page.goto("/");
  // Reach the chat the way the phone does: Agents home → the agent's
  // missions → the mission's chat push.
  await page.getByTestId("agents-home-row").tap();
  await page
    .getByTestId("agent-missions-screen")
    .getByText("Plan a trip to Tokyo")
    .tap();
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  await page.goBack();
  await expect(page.getByTestId("mission-chat-screen")).toHaveCount(0);
  // Still in the app, exactly where the push happened.
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();
});
