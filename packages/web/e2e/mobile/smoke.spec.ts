import { SEED_AGENT_NAME } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import { navBar } from "../support/mobile-nav";
import { screen } from "../support/team-nav";

test("boots to a usable shell on a phone viewport", async ({ page }) => {
  await page.goto("/");

  await expect(navBar(page)).toBeVisible();
  await expect(page.locator("[data-tour-target='sidebar']")).toHaveCount(0);
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(page.getByTestId("agents-home-row")).toContainText(
    SEED_AGENT_NAME,
  );

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("touch drives the UI: drilling into a mission opens its chat", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByTestId("agents-home-row").tap();
  await page
    .getByTestId("agent-missions-screen")
    .getByText("Plan a trip to Tokyo")
    .tap();
  await expect(page.getByText("Task: Plan a trip to Tokyo")).toBeVisible();

  await page.getByTestId("mission-chat-back").tap();
  await expect(page.getByTestId("mission-chat-screen")).toHaveCount(0);
});
