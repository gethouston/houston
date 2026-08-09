import { expect, test } from "./support/fixtures";
import { expectTeamSectionSelected, screen } from "./support/team-nav";

test("a narrow team header routes sections through the compact switcher", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const activeScreen = screen(page);
  const switcher = activeScreen.locator("[data-team-section-switcher]");
  await expect(switcher).toBeVisible();
  await expect(activeScreen.locator("[data-team-section-tab]")).toHaveCount(0);

  await switcher.click();
  const sections = page.getByRole("menuitemcheckbox");
  await expect(sections).toHaveCount(5);
  await expect(
    page.locator("[data-team-section-tab='mission-control']"),
  ).toHaveAttribute("aria-checked", "true");

  await page.locator("[data-team-section-tab='routines']").click();
  await expectTeamSectionSelected(page, "Routines");
  await expect(switcher).toBeVisible();
});
