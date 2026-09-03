import { expect, test } from "../support/fixtures";
import { navBar } from "../support/mobile-nav";
import { screen } from "../support/team-nav";

/**
 * Phone-project smoke: the app boots and is usable at a Pixel-7-class
 * viewport (412px logical width, touch input, mobile UA — see the `mobile`
 * project in playwright.config.ts). This is the scaffold spec for the
 * responsiveness overhaul: deeper phone coverage lands beside it as the
 * mobile shell grows.
 */

test("boots to a usable shell on a phone viewport", async ({ page }) => {
  await page.goto("/");

  // The phone shell: no rail and no top bar — the floating nav bar is the
  // whole chrome, over the Agents home (the landing tree's root) with the
  // seeded mission previewed.
  await expect(navBar(page)).toBeVisible();
  await expect(page.locator("[data-tour-target='sidebar']")).toHaveCount(0);
  await expect(screen(page)).toHaveAttribute("data-screen", "agents-home");
  await expect(page.getByTestId("agents-home-row")).toContainText("Houston");

  // Nothing forces the document wider than the phone viewport.
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
