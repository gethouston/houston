import { expect, type Locator, type Page } from "@playwright/test";
import { headerChrome, rail } from "./nav-common";
import { teamTab } from "./team-nav";

/** The labels of the agent settings lozenges. */
export type AgentSettingsSection =
  | "Job description"
  | "Learnings"
  | "People"
  | "Integrations"
  | "AI Models"
  | "Skills"
  | "Settings";

const AGENT_SECTION_IDS: Readonly<Record<AgentSettingsSection, string>> = {
  "Job description": "job-description",
  Learnings: "learnings",
  People: "people",
  Integrations: "integrations",
  "AI Models": "models",
  Skills: "skills",
  Settings: "manage",
};

export function agentSectionTab(
  page: Page,
  section: AgentSettingsSection,
): Locator {
  return headerChrome(page).locator(
    `[data-agent-section-tab='${AGENT_SECTION_IDS[section]}']`,
  );
}

/** The whole agent-settings lozenge cluster, on the screen on the glass. */
export function agentSectionTabs(page: Page): Locator {
  return headerChrome(page).locator("[data-agent-section-tab]");
}

/** The phone's replacement for the full agent-settings lozenge cluster. */
function agentSectionSwitcher(page: Page): Locator {
  return headerChrome(page).locator("[data-agent-section-switcher]");
}

/**
 * Assert exactly which sections an agent's settings page offers, in either
 * layout.
 *
 * Reading the WHOLE cluster is what makes an absence meaningful: a personal
 * space drops the access sections (`agentAccessSections` → `[]`), so "People
 * has no lozenge" must be read against the sections that ARE drawn, never
 * against a bare count of zero. The phone folds the drilled cluster into the
 * back chip's menu, which is the second form below.
 */
export async function expectAgentSettingsSections(
  page: Page,
  sections: readonly AgentSettingsSection[],
): Promise<void> {
  const tabs = agentSectionTabs(page);
  if (await tabs.first().isVisible()) {
    await expect(tabs).toHaveCount(sections.length);
    for (const section of sections)
      await expect(agentSectionTab(page, section)).toBeVisible();
    return;
  }

  const switcher = agentSectionSwitcher(page);
  await expect(switcher).toBeVisible();
  await switcher.click();
  const menuSections = page.locator(
    "[role='menuitemcheckbox'][data-agent-section-tab]",
  );
  await expect(menuSections).toHaveCount(sections.length);
  for (const section of sections) {
    await expect(
      page.locator(
        `[role='menuitemcheckbox'][data-agent-section-tab='${AGENT_SECTION_IDS[section]}']`,
      ),
    ).toBeVisible();
  }
  await page.keyboard.press("Escape");
}

/**
 * ONE agent's row in the rail.
 *
 * By the row's `title`, not its accessible name: a row that is carrying work
 * ("2 issues need you") folds that count into the button's name, so an exact
 * name match finds the quiet agents and misses the busy ones — precisely the
 * ones a spec arms on purpose. The title is the agent's name and nothing else.
 */
export function agentRow(page: Page, agentName: string): Locator {
  return rail(page).locator(
    `[data-sidebar-item] button[title="${agentName.replace(/"/g, '\\"')}"]`,
  );
}

/**
 * Open one agent's focused screen through its rail row.
 *
 * The arrival check reads the screen's IDENTITY marker rather than a heading:
 * the marker rides the desktop strip and the phone's drilled header alike, so
 * one wait covers both trees.
 */
export async function openAgentScreen(
  page: Page,
  agentName: string,
): Promise<void> {
  await agentRow(page, agentName).click();
  await expect(headerChrome(page).locator("[data-agent-screen]")).toContainText(
    agentName,
  );
}

/**
 * Open one focused agent's settings, drilled to a section. Pass `null` to
 * stay on whatever the page lands on by itself (the Settings section — the
 * default lens for a page opened to administer the agent).
 */
export async function openAgentSettings(
  page: Page,
  agentName: string,
  section: AgentSettingsSection | null = "Job description",
): Promise<void> {
  await openAgentScreen(page, agentName);
  // The employee section strip leads to its own settings screen.
  const settings = teamTab(page, "Settings");
  await expect(settings, `Cannot open ${agentName}'s settings`).toBeVisible();
  await settings.click();
  if (section !== null) {
    await openAgentSettingsSection(page, section);
  }
}

/**
 * Pick a section on an already-open agent settings page.
 *
 * On the phone the drilled cluster folds into `[data-agent-section-switcher]`,
 * so a section is reached through whichever form the breakpoint draws. A
 * section this page does not offer at all (a personal space drops the access
 * sections, `agentAccessSections` → `[]`) is reachable through NEITHER control,
 * and that throws — waiting on a switcher the layout will never draw would
 * spend the whole test budget to report a timeout instead of the missing
 * section.
 */
export async function openAgentSettingsSection(
  page: Page,
  section: AgentSettingsSection,
): Promise<void> {
  // A phone's strip paints its safe collapsed form until the width observer
  // reports, so the cluster can swap forms once between the visibility check
  // and the click. Retry through that window before calling the section
  // genuinely absent.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const tab = agentSectionTab(page, section);
    if (await tab.isVisible()) {
      try {
        await tab.click({ timeout: 5_000 });
        return;
      } catch {
        // Re-moded mid-click: the section moved into the switcher, not away.
      }
    }

    const switcher = agentSectionSwitcher(page);
    if (await switcher.isVisible()) {
      await switcher.click();
      await page
        .locator(
          `[role='menuitemcheckbox'][data-agent-section-tab='${AGENT_SECTION_IDS[section]}']`,
        )
        .click();
      return;
    }
    await page.waitForTimeout(400);
  }

  throw new Error(
    `Cannot open agent settings section "${section}": neither its lozenge nor the phone switcher is on the agent's settings page, so this page does not offer that section at all.`,
  );
}
