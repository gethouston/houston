import { expect, type Locator, type Page } from "@playwright/test";
import { moreMenu, moreRow, openMoreMenu } from "./mobile-nav";

function isPhone(page: Page): boolean {
  return (page.viewportSize()?.width ?? 768) < 768;
}

function railRoot(page: Page): Locator {
  return page.locator("[data-tour-target='sidebar']");
}

const ON_THE_RAIL = new Set(["nav-integrations", "nav-ai-hub"]);

export function workspaceMenuTrigger(page: Page): Locator {
  return railRoot(page).locator(
    "[data-tour-target='workspaceMenu'] button[aria-haspopup='menu']",
  );
}

export function workspaceMenu(page: Page): Locator {
  return page.getByRole("menu");
}

export async function openWorkspaceMenu(page: Page): Promise<Locator> {
  await workspaceMenuTrigger(page).click();
  const menu = workspaceMenu(page);
  await expect(menu).toBeVisible();
  return menu;
}

export function accountMenuTrigger(page: Page): Locator {
  return isPhone(page)
    ? moreMenu(page).getByTestId("more-account")
    : workspaceMenuTrigger(page);
}

export async function openAccountMenu(page: Page): Promise<Locator> {
  if (isPhone(page)) {
    await openMoreMenu(page, "click");
    await accountMenuTrigger(page).click();
    const accountPage = moreMenu(page).getByTestId("more-account-page");
    await expect(accountPage).toBeVisible();
    return accountPage;
  }
  return openWorkspaceMenu(page);
}

export function accountAction(
  page: Page,
  account: Locator,
  name: string,
): Locator {
  return account.getByRole(isPhone(page) ? "button" : "menuitem", {
    name,
    exact: true,
  });
}

export function railDestination(page: Page, anchor: string): Locator {
  return railRoot(page).locator(`[data-tour-target='${anchor}']`);
}

export async function openDestinations(
  page: Page,
  anchor: string,
): Promise<Locator> {
  if (isPhone(page)) return openMoreMenu(page, "click");
  if (ON_THE_RAIL.has(anchor)) {
    await expect(railRoot(page)).toBeVisible();
    return railRoot(page);
  }
  return openWorkspaceMenu(page);
}

export function destinationRow(page: Page, anchor: string): Locator {
  if (isPhone(page)) return moreRow(page, anchor);
  return ON_THE_RAIL.has(anchor)
    ? railDestination(page, anchor)
    : workspaceMenu(page).locator(`[data-tour-target='${anchor}']`);
}

export async function openDestination(
  page: Page,
  anchor: string,
): Promise<void> {
  await openDestinations(page, anchor);
  await destinationRow(page, anchor).click();
}

export async function openNavRow(
  page: Page,
  id: "integrations" | "ai-hub" | "academy" | "settings",
): Promise<void> {
  await openDestination(page, `nav-${id}`);
}
