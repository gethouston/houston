import { expect, type Locator, type Page } from "@playwright/test";
import { BOOT_TIMEOUT } from "../config";
import { screen } from "./team-nav";

export type PressMode = "tap" | "click";

export async function press(
  locator: Locator,
  mode: PressMode = "tap",
): Promise<void> {
  if (mode === "tap") await locator.tap();
  else await locator.click();
}

export async function awaitAgentsHome(page: Page): Promise<Locator> {
  const row = page.getByTestId("agents-home-row").first();
  await expect(row).toBeVisible({ timeout: BOOT_TIMEOUT });
  return row;
}

export type MobileTab = "agents" | "more";

export function navBar(page: Page): Locator {
  return page.getByTestId("mobile-nav-bar");
}

export function navItem(page: Page, tab: MobileTab): Locator {
  return navBar(page).locator(`[data-tab='${tab}']`);
}

export function newTaskButton(page: Page): Locator {
  return navBar(page).getByRole("button", { name: "New task" });
}

export function moreMenu(page: Page): Locator {
  return page.getByTestId("mobile-more-menu");
}

export function moreRow(page: Page, anchor: string): Locator {
  return moreMenu(page).locator(`[data-tour-target='${anchor}']`);
}

export async function openMoreMenu(
  page: Page,
  mode: PressMode = "tap",
): Promise<Locator> {
  await press(navItem(page, "more"), mode);
  const menu = moreMenu(page);
  await expect(menu).toBeVisible();
  return menu;
}

export type PhoneTeamSection = "mission-control" | "routines" | "files";

export async function openPhoneTeamSection(
  page: Page,
  section: PhoneTeamSection,
  mode: PressMode = "tap",
): Promise<void> {
  await press(navItem(page, "agents"), mode);
  await press(await awaitAgentsHome(page), mode);
  await expect(page.getByTestId("agent-missions-screen")).toBeVisible();
  if (section === "mission-control") return;
  await press(page.getByTestId("agent-missions-menu"), mode);
  await press(
    page
      .getByTestId("agent-missions-menu-section")
      .and(page.locator(`[data-section='${section}']`)),
    mode,
  );
  await expect(screen(page)).toHaveAttribute("data-screen", "agent");
}
