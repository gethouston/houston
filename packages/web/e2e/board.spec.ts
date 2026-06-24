import { expect, test } from "./support/fixtures";

/**
 * The mission board is "files-first": it reads `.houston/activity/activity.json`
 * (served by the fake host's agentfile store) and groups missions into columns by
 * status. These specs prove that data path and card → chat navigation.
 */
test("renders the seeded missions on the board", async ({ page }) => {
  await page.goto("/");

  // Seeded in state.ts: one "needs_you" mission, one "done" mission.
  await expect(page.getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByText("Draft the launch email")).toBeVisible();
});

test("opens a mission's chat when its card is clicked", async ({ page }) => {
  await page.goto("/");

  await page.getByText("Plan a trip to Tokyo").click();

  // The mission's conversation opens (an existing mission uses the follow-up
  // composer; a brand-new conversation uses "What should the agent work on?").
  await expect(page.getByText("Mission: Plan a trip to Tokyo")).toBeVisible();
  await expect(page.getByPlaceholder("Send a follow-up...")).toBeVisible();
});
