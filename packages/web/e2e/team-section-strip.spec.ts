import { expect, test } from "./support/fixtures";
import {
  expectTeamSectionSelected,
  expectTeamSections,
  screen,
} from "./support/team-nav";

/**
 * A narrow team strip keeps its LOZENGES and spends the width it does not have
 * on the tools instead: they leave the strip for their own row under it. The
 * sections a user navigates by stay on the glass at every width a board is
 * drawn at, an open side panel on a laptop included — never folded into a
 * closed menu.
 */
test("a narrow team header keeps its lozenges and stacks its tools", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");

  const activeScreen = screen(page);
  await expect(
    activeScreen.locator("[data-team-section-tab]").first(),
  ).toBeVisible();
  await expectTeamSections(page, [
    "Tasks",
    "Routines",
    "Files",
    "Team Settings",
  ]);
  await expectTeamSectionSelected(page, "Tasks");

  // The strip is below the team's one-row minimum, so the board's tools sit
  // BELOW it — in the body, under the header the lozenges still own.
  const header = activeScreen.getByTestId("page-header");
  // The toolbar's own control, by its tour anchor: a board column carries a
  // "New task" button of its own, which is not the strip's tools cluster.
  const newTask = activeScreen.locator("[data-tour-target='newMission']");
  await expect(newTask).toBeVisible();
  await expect(header.locator("[data-tour-target='newMission']")).toHaveCount(
    0,
  );
  const strip = await header.boundingBox();
  const tools = await newTask.boundingBox();
  if (!strip || !tools) throw new Error("the header and its tools must draw");
  expect(tools.y).toBeGreaterThanOrEqual(strip.y + strip.height);

  await activeScreen.locator("[data-team-section-tab='routines']").click();
  await expectTeamSectionSelected(page, "Routines");
  await expect(activeScreen.locator("[data-team-section-tab]")).toHaveCount(4);
});
