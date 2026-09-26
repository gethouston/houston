import { expect, type Locator, type Page } from "@playwright/test";
import { rail } from "./team-nav";

/** The shared create sheet, opened directly on the requested form. */
export function createSheet(page: Page): Locator {
  return page.locator('[data-slot="flow-sheet"]');
}

/** Open the band's add menu. */
export async function openCreateDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Create", exact: true }).click();
}

/** Open the compact team form from the rail's add menu. */
export async function startNewTeam(page: Page): Promise<void> {
  const direct = page.getByRole("button", { name: "New group", exact: true });
  if (await direct.isVisible()) await direct.click();
  else {
    await openCreateDialog(page);
    await page.getByRole("menuitem", { name: "New group" }).click();
  }
  await teamNameField(page).waitFor({ state: "visible" });
}

/** The new team's name field, inside the sheet. */
export function teamNameField(page: Page): Locator {
  return createSheet(page).getByRole("textbox", { name: "Group name" });
}

/** Create a named team end to end: the sheet's choice, then its form. */
export async function createTeam(page: Page, name: string): Promise<void> {
  await startNewTeam(page);
  await teamNameField(page).fill(name);
  await createSheet(page).getByRole("button", { name: "Create group" }).click();
  await expect(rail(page).getByText(name, { exact: true })).toBeVisible();
}
