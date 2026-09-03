import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import {
  navItem,
  openPhoneTeamSection,
  teamSectionRow,
  teamSectionRows,
} from "../support/mobile-nav";
import { screen } from "../support/team-nav";

/**
 * The phone's Teams tab root: every team as a tree row with its sections
 * indented under it.
 *
 * The tree is the phone's ONLY section switcher — a team's own screen carries a
 * back chip and a title instead — so what this guards is the round trip: the
 * tree offers the sections the team view would actually render, tapping one
 * PUSHES that screen, and both back affordances (the chip and hardware back)
 * land on the tree the tap came from.
 */

async function seedRoutine(name: string): Promise<void> {
  const agents = (await (await fetch(`${FAKE_HOST_URL}/agents`)).json()) as {
    id: string;
  }[];
  await fetch(`${FAKE_HOST_URL}/agents/${agents[0].id}/routines`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name, prompt: "p", schedule: "0 9 * * *" }),
  });
}

test("the tree lists the seeded team with its sections in order", async ({
  page,
}) => {
  await page.goto("/");
  await navItem(page, "teams").tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "teams-home");

  // One team — the workspace's own default block — and it is NOT tappable: a
  // team has no screen of its own, its first section is what "the team" means.
  const team = screen(page).getByTestId("teams-home-team");
  await expect(team).toHaveCount(1);
  await expect(team).toHaveAttribute("data-team-id", /.+/);

  // The seeded caller is single-player, so they manage the team: the shared
  // sections first, then the ones behind the desktop's Settings door. People is
  // absent — this deployment has no organization to show.
  await expect(teamSectionRows(page)).toHaveText([
    "Tasks",
    "Routines",
    "Context",
    "Files",
    "Settings",
  ]);
});

test("Tasks pushes the team screen, and the back chip returns to the tree", async ({
  page,
}) => {
  await page.goto("/");
  await openPhoneTeamSection(page, "mission-control");

  // The pushed team screen: the seeded board, titled, with no section
  // switcher — the tree one level up already is the switcher.
  await expect(screen(page).getByText("Plan a trip to Tokyo")).toBeVisible();
  await expect(screen(page).locator("[data-team-section-tab]")).toHaveCount(0);
  await expect(
    screen(page).locator("[data-team-section-switcher]"),
  ).toHaveCount(0);

  const back = screen(page).getByTestId("team-mobile-back");
  await expect(back).toHaveAttribute("aria-label", "Teams");
  await back.tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "teams-home");
  await expect(teamSectionRow(page, "mission-control")).toBeVisible();
});

test("hardware back pops the team screen onto the tree", async ({ page }) => {
  await page.goto("/");
  await openPhoneTeamSection(page, "mission-control");

  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "teams-home");
  await expect(navItem(page, "teams")).toHaveAttribute("aria-current", "page");
});

test("Routines opens the team's routines section", async ({ page }) => {
  await seedRoutine("Morning digest");

  await page.goto("/");
  await openPhoneTeamSection(page, "routines");

  await expect(
    screen(page)
      .getByTestId("routine-row")
      .filter({ hasText: "Morning digest" }),
  ).toBeVisible();
  // The drilled header names the section it pushed, beside the chip back to
  // the tree — never a section switcher.
  await expect(screen(page).getByTestId("team-mobile-back")).toBeVisible();
  await expect(
    screen(page)
      .locator("p")
      .filter({ hasText: /^Routines$/ }),
  ).toHaveCount(1);
});
