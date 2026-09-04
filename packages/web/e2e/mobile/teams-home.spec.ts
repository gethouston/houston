import { FAKE_HOST_URL } from "@houston/fake-host";
import { expect, test } from "../support/fixtures";
import {
  navItem,
  openPhoneTeamSection,
  teamSectionRow,
  teamSectionRows,
  teamSettingsTab,
  teamSettingsTabs,
} from "../support/mobile-nav";
import { screen } from "../support/team-nav";

/**
 * The phone's Teams tab root: every team as a tree row with its sections
 * indented under it.
 *
 * The tree is the phone's ONLY section switcher — a team's own screen carries a
 * back chip and a title instead — so what this guards is the round trip: the
 * tree offers the sections the desktop strip offers, tapping one PUSHES that
 * screen, the Team Settings row lands on the drilled level with the desktop's
 * own tabs, and both back affordances (the chip and hardware back) land on the
 * tree the tap came from.
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

test("the tree lists the seeded team with the desktop's sections in order", async ({
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

  // The seeded caller is single-player, so they manage the team: the strip's
  // three shared sections, then the Team Settings door — the same four words
  // the desktop strip carries. Context and People are BEHIND the door.
  await expect(teamSectionRows(page)).toHaveText([
    "Tasks",
    "Routines",
    "Files",
    "Team Settings",
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

test("Team Settings lands on the drilled level with the desktop's tabs", async ({
  page,
}) => {
  await page.goto("/");
  await openPhoneTeamSection(page, "settings");

  // The desktop's door opens on Context; the phone's does too, under a header
  // that names the level. The tabs are the desktop's own, minus People, which
  // this deployment (no organization) has nobody to show under.
  await expect(
    screen(page)
      .locator("p")
      .filter({ hasText: /^Team Settings$/ }),
  ).toHaveCount(1);
  await expect(teamSettingsTabs(page)).toHaveText([
    "Context",
    "Agents",
    "Settings",
  ]);
  await expect(teamSettingsTab(page, "context")).toHaveAttribute(
    "aria-selected",
    "true",
  );

  // A tab swaps the pane in place: the Agents pane lists the seeded agent.
  await teamSettingsTab(page, "agents").tap();
  await expect(teamSettingsTab(page, "agents")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(screen(page).getByText("Houston")).toBeVisible();

  await teamSettingsTab(page, "settings").tap();
  await expect(
    screen(page).getByRole("button", { name: "Delete team" }),
  ).toBeVisible();

  // Tabs replaced the entry rather than pushing: ONE hardware back lands on
  // the tree, not on the previous tab.
  await page.goBack();
  await expect(screen(page)).toHaveAttribute("data-screen", "teams-home");
  await expect(teamSectionRow(page, "settings")).toBeVisible();
});

test("the Team Settings back chip retreats to the tree", async ({ page }) => {
  await page.goto("/");
  await openPhoneTeamSection(page, "settings");

  const back = screen(page).getByTestId("team-settings-mobile-back");
  await expect(back).toHaveAttribute("aria-label", "Teams");
  await back.tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "teams-home");
});

test("the title row's New team control opens the create-team dialog", async ({
  page,
}) => {
  await page.goto("/");
  await navItem(page, "teams").tap();
  await expect(screen(page)).toHaveAttribute("data-screen", "teams-home");

  // The rail that carries "New team" on the desktop is not rendered on the
  // phone, so the tree's title row offers the same dialog.
  await page.getByTestId("teams-home-new-team").tap();
  await expect(
    page.getByRole("dialog", { name: "Create a team" }),
  ).toBeVisible();
});
