import { expect, type Locator, type Page } from "@playwright/test";
import { ASSISTANT_COMPOSER } from "./composer";
import { screen } from "./team-nav";
import {
  accountAction,
  openAccountMenu,
  openDestination,
  openDestinations,
} from "./workspace-menu";

export function assistantRow(page: Page): Locator {
  return page.getByTestId("rail-assistant");
}

export async function openAssistant(page: Page): Promise<void> {
  await assistantRow(page).click();
  await expect(screen(page).getByPlaceholder(ASSISTANT_COMPOSER)).toBeVisible();
}

export async function adminRow(page: Page): Promise<Locator> {
  const menu = await openDestinations(page, "rail-admin");
  return menu.getByTestId("rail-admin");
}

export function adminHeading(page: Page): Locator {
  return screen(page).getByRole("heading", { name: "Workspace", level: 1 });
}

export async function openAdmin(page: Page): Promise<void> {
  await (await adminRow(page)).click();
  await expect(screen(page)).toHaveAttribute("data-screen", "admin");
  await expect(adminHeading(page)).toBeVisible();
}

const ACCOUNT_SCREENS = {
  Profile: "profile",
  "About me": "about-me",
} as const;

export async function openAccountScreen(
  page: Page,
  name: keyof typeof ACCOUNT_SCREENS,
): Promise<void> {
  const menu = await openAccountMenu(page);
  await accountAction(page, menu, name).click();
  await expect(screen(page)).toHaveAttribute(
    "data-screen",
    ACCOUNT_SCREENS[name],
  );
  await expect(
    screen(page).getByRole("heading", { name, level: 1 }),
  ).toBeVisible();
}

export async function openAboutMe(page: Page): Promise<void> {
  await openAccountScreen(page, "About me");
}

export type AdminSection = "Org chart" | "People" | "Billing" | "Activity";

export const ADMIN_SECTION_TAB_IDS: Readonly<Record<AdminSection, string>> = {
  "Org chart": "orgChart",
  People: "people",
  Billing: "billing",
  Activity: "activity",
};

export function adminSectionTab(page: Page, name: AdminSection): Locator {
  return screen(page).locator(
    `[data-admin-section-tab='${ADMIN_SECTION_TAB_IDS[name]}']`,
  );
}

function adminSectionSwitcher(page: Page): Locator {
  return screen(page).locator("[data-admin-section-switcher]");
}

export async function expectAdminSections(
  page: Page,
  names: readonly AdminSection[],
): Promise<void> {
  const tabs = screen(page).locator("[data-admin-section-tab]");
  if (await tabs.first().isVisible()) {
    await expect(tabs).toHaveCount(names.length);
    for (const name of names)
      await expect(adminSectionTab(page, name)).toBeVisible();
    return;
  }

  const switcher = adminSectionSwitcher(page);
  await expect(switcher).toBeVisible();
  await switcher.click();
  const menuSections = page.locator(
    "[role='menuitemcheckbox'][data-admin-section-tab]",
  );
  await expect(menuSections).toHaveCount(names.length);
  for (const name of names) {
    await expect(
      page.locator(
        `[role='menuitemcheckbox'][data-admin-section-tab='${ADMIN_SECTION_TAB_IDS[name]}']`,
      ),
    ).toBeVisible();
  }
  await page.keyboard.press("Escape");
}

export async function openAdminSection(
  page: Page,
  name: AdminSection,
): Promise<void> {
  await openAdmin(page);
  const id = ADMIN_SECTION_TAB_IDS[name];
  const tab = adminSectionTab(page, name);
  if (await tab.isVisible()) {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-current", "page");
  } else {
    await adminSectionSwitcher(page).click();
    await page
      .locator(`[role='menuitemcheckbox'][data-admin-section-tab='${id}']`)
      .click();
  }
  await expect(
    screen(page).locator(`[data-admin-section-body='${id}']`),
  ).toBeVisible();
}

export function companyContextButton(page: Page): Locator {
  return screen(page).locator("[data-company-context-trigger]");
}

export async function openCompanyContext(page: Page): Promise<Locator> {
  await openAdmin(page);
  await companyContextButton(page).click();
  const sheet = page.getByRole("dialog", { name: "Company context" });
  await expect(sheet).toBeVisible();
  return sheet;
}

export async function openSettings(page: Page): Promise<void> {
  await openDestination(page, "nav-settings");
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
}
