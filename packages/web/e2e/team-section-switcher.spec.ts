import { expect, test } from "./support/fixtures";
import {
  expectTeamSectionSelected,
  expectTeamSections,
  screen,
} from "./support/team-nav";

test("a narrow team header routes sections through the compact switcher", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const activeScreen = screen(page);
  const switcher = activeScreen.locator("[data-team-section-switcher]");
  await expect(switcher).toBeVisible();
  await expect(activeScreen.locator("[data-team-section-tab]")).toHaveCount(0);

  // The menu carries the team's WHOLE section set — the board included, named
  // outright, because inside a list of names "the team's lozenge stands for it"
  // stops being legible.
  await expectTeamSections(page, [
    "Tasks",
    "Routines",
    "Files",
    "Team Settings",
  ]);
  await expectTeamSectionSelected(page, "Tasks");

  await switcher.click();
  await page
    .locator("[role='menuitemcheckbox'][data-team-section-tab='routines']")
    .click();
  await expectTeamSectionSelected(page, "Routines");
  await expect(switcher).toBeVisible();
});
