import { expect, type Page } from "@playwright/test";
import { rail } from "./team-nav";

/**
 * The rail's ONE create menu, for the specs that used to click a bare glyph.
 *
 * Everything a user can ADD to the sidebar lives behind a single "+" on the
 * "Your teams" band: "New agent" and "New team". There used to be a glyph per
 * action up there, and every spec spelled its own click. One helper module, so
 * a spec says what the user wanted rather than where the affordance happens to
 * be. (Joining a team is NOT here and never comes back: people are added to a
 * team from that team's own Members card.)
 *
 * "New agent" is ALSO a visible row at the foot of each expanded team, which is the door
 * `support/create-agent.ts` walks; this file is only about the band.
 */

/** Open the band's "+". Named by `shell:sidebar.createMenu`. */
export async function openCreateMenu(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Create", exact: true }).click();
}

/**
 * Start a new team. Leaves the creation modal open for the caller.
 */
export async function startNewTeam(page: Page): Promise<void> {
  await openCreateMenu(page);
  await page.getByRole("menuitem", { name: "New team" }).click();
}

/** Create a named team end to end: the menu, then the modal. */
export async function createTeam(page: Page, name: string): Promise<void> {
  await startNewTeam(page);
  const input = page.getByPlaceholder("Team name");
  await input.waitFor({ state: "visible" });
  await input.fill(name);
  await page.getByRole("button", { name: "Create team" }).click();
  await expect(rail(page).getByText(name, { exact: true })).toBeVisible();
}
