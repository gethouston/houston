import { expect, type Locator, type Page } from "@playwright/test";
import { headerChrome, rail, screen } from "./nav-common";

export * from "./agent-nav";
export * from "./nav-common";

/** The sections on one AI Employee's screen. */
export type TeamSection = "Tasks" | "Routines" | "Files" | "Settings";

/** Section name -> the `data-team-section-tab` value its lozenge carries. */
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

/** The employee screen's section tabs. */
export function teamTabs(page: Page): Locator {
  return headerChrome(page).locator("[data-team-section-tab]");
}

/** One section tab of the open employee. */
export function teamTab(page: Page, section: TeamSection): Locator {
  return headerChrome(page).locator(
    `[data-team-section-tab='${TEAM_SECTION_TAB_IDS[section]}']`,
  );
}

/** An employee row opens that employee's screen from a top-level view. */
function currentAgentRow(page: Page): Locator {
  return rail(page).locator("[data-sidebar-item]").first();
}

/** Assert the selected section on the strip. */
export async function expectTeamSectionSelected(
  page: Page,
  section: TeamSection,
): Promise<void> {
  await expect(teamTab(page, section)).toHaveAttribute("aria-current", "page");
}

/** Assert exactly which sections the current employee offers. */
export async function expectTeamSections(
  page: Page,
  sections: readonly TeamSection[],
): Promise<void> {
  await expect(teamTabs(page)).toHaveCount(sections.length);
  for (const section of sections)
    await expect(teamTab(page, section)).toBeVisible();
}

/** Open a section of the current employee, entering from the rail if needed. */
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
