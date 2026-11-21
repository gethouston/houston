import { expect, type Locator, type Page } from "@playwright/test";
import { headerChrome, rail } from "./nav-common";
import { teamTab } from "./team-nav";

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

export function agentSectionTabs(page: Page): Locator {
  return headerChrome(page).locator("[data-agent-section-tab]");
}

function agentSectionSwitcher(page: Page): Locator {
  return headerChrome(page).locator("[data-agent-section-switcher]");
}

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

export function agentRow(page: Page, agentName: string): Locator {
  return rail(page).locator(
    `[data-sidebar-item] button[title="${agentName.replace(/"/g, '\\"')}"]`,
  );
}

export async function openAgentScreen(
  page: Page,
  agentName: string,
): Promise<void> {
  await agentRow(page, agentName).click();
  await expect(headerChrome(page).locator("[data-agent-screen]")).toContainText(
    agentName,
  );
}

export async function openAgentSettings(
  page: Page,
  agentName: string,
  section: AgentSettingsSection | null = "Job description",
): Promise<void> {
  await openAgentScreen(page, agentName);
  const settings = teamTab(page, "Settings");
  await expect(settings, `Cannot open ${agentName}'s settings`).toBeVisible();
  await settings.click();
  if (section !== null) {
    await openAgentSettingsSection(page, section);
  }
}

export async function openAgentSettingsSection(
  page: Page,
  section: AgentSettingsSection,
): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const tab = agentSectionTab(page, section);
    if (await tab.isVisible()) {
      try {
        await tab.click({ timeout: 5_000 });
        return;
      } catch {}
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
