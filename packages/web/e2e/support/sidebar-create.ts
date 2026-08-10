import { expect, type Page } from "@playwright/test";
import { rail } from "./team-nav";

/**
 * The rail's ONE create control, for the specs that used to click a bare glyph.
 *
 * Everything a user can ADD to the sidebar lives behind a single "+" on the
 * "Your teams" band. With both actions available it opens the CREATE DIALOG —
 * a modal of square choice tiles, "New agent" and "New team" — and picking a
 * tile hands off to that action's own flow. One helper module, so a spec says
 * what the user wanted rather than where the affordance happens to be.
 * (Joining a team is NOT here and never comes back: people are added to a
 * team from that team's own Members card.)
 *
 * "New agent" is ALSO a visible row at the foot of each expanded team, which is the door
 * `support/create-agent.ts` walks; this file is only about the band.
 */

/** Open the band's "+". Named by `shell:sidebar.createDialog`. */
export async function openCreateDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Create", exact: true }).click();
}

/**
 * Start a new team. Leaves the creation modal open for the caller.
 */
export async function startNewTeam(page: Page): Promise<void> {
  const direct = page.getByRole("button", { name: "New team", exact: true });
  if (await direct.isVisible()) {
    await direct.click();
  } else {
    await openCreateDialog(page);
    // The chooser's square tile; it closes the chooser and opens the
    // create-team modal.
    await page
      .getByRole("dialog", { name: "Create", exact: true })
      .getByRole("button", { name: "New team", exact: true })
      .click();
  }
}

/** Create a named team end to end: the chooser, then the modal. */
export async function createTeam(page: Page, name: string): Promise<void> {
  await startNewTeam(page);
  const dialog = page.getByRole("dialog", { name: "Create a team" });
  const input = dialog.getByRole("textbox", { name: "Team name" });
  await input.waitFor({ state: "visible" });
  await input.fill(name);
  await dialog.getByRole("button", { name: "Create team" }).click();
  await expect(rail(page).getByText(name, { exact: true })).toBeVisible();
}
