import type { Locator, Page } from "@playwright/test";

export function rail(page: Page): Locator {
  return page.locator("[data-tour-target='agents']");
}

export type NavRowId = "integrations" | "ai-hub" | "academy" | "settings";

export function navRow(page: Page, id: NavRowId): Locator {
  return page.locator(`[data-tour-target='nav-${id}']`);
}

export function screen(page: Page): Locator {
  return page.locator("[data-screen-active='true']");
}

export function missionCard(page: Page, title: string): Locator {
  return screen(page).getByTestId("board-columns").getByText(title);
}

export function headerChrome(page: Page): Locator {
  return screen(page);
}

export function litRows(rows: Locator): Locator {
  return rows.filter({ has: rows.page().locator("[aria-current='page']") });
}
