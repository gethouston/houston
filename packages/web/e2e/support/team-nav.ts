import { expect, type Locator, type Page } from "@playwright/test";
import { headerChrome, rail, screen } from "./nav-common";

export * from "./agent-nav";
export * from "./nav-common";

export type TeamSection = "Tasks" | "Routines" | "Files" | "Settings";

export const TEAM_SECTION_TAB_IDS: Readonly<Record<TeamSection, string>> = {
  Tasks: "mission-control",
  Routines: "routines",
  Files: "files",
  Settings: "settings",
};

export async function openArchivedTasks(page: Page): Promise<void> {
  await screen(page).getByRole("button", { name: "Archived" }).click();
}

export async function returnToActiveTasks(page: Page): Promise<void> {
  await screen(page).getByRole("button", { name: "Back to tasks" }).click();
}

export function teamTabs(page: Page): Locator {
  return headerChrome(page).locator("[data-team-section-tab]");
}

export function teamTab(page: Page, section: TeamSection): Locator {
  return headerChrome(page).locator(
    `[data-team-section-tab='${TEAM_SECTION_TAB_IDS[section]}']`,
  );
}

function currentAgentRow(page: Page): Locator {
  return rail(page).locator("[data-sidebar-item]").first();
}

export async function expectTeamSectionSelected(
  page: Page,
  section: TeamSection,
): Promise<void> {
  await expect(teamTab(page, section)).toHaveAttribute("aria-current", "page");
}

export async function expectTeamSections(
  page: Page,
  sections: readonly TeamSection[],
): Promise<void> {
  await expect(teamTabs(page)).toHaveCount(sections.length);
  for (const section of sections)
    await expect(teamTab(page, section)).toBeVisible();
}

export async function openTeamSection(
  page: Page,
  section: TeamSection,
): Promise<void> {
  const sectioned = teamTab(page, "Tasks");
  await expect(
    sectioned.or(currentAgentRow(page)).first(),
    `an employee navigation surface for "${section}" should become available`,
  ).toBeVisible();

  if (!(await sectioned.isVisible())) {
    await currentAgentRow(page).getByRole("button").first().click();
    await expect(sectioned).toBeVisible();
  }

  const tab = teamTab(page, section);
  await expect(tab).toBeVisible();
  await tab.click();
}
