import { expect, type Locator, type Page } from "@playwright/test";
import { rail } from "./team-nav";

/**
 * The rail's ONE create control, and the ONE sheet behind it.
 *
 * Everything a user can ADD to the sidebar lives behind a single "+" on the
 * "Your teams" band, and pressing it opens the create sheet on the choice of
 * what to add — an AI Employee or a team — with every following screen inside
 * that same sheet. With only one of the two available the sheet opens straight
 * on it and the "+" is named for it instead. One helper module, so a spec says what the user wanted rather than
 * where the affordance happens to be.
 * (Joining a team is NOT here and never comes back: people are added to a
 * team from that team's own Members card.)
 *
 * "New AI Employee" is ALSO a visible row at the foot of each expanded team,
 * which is the door `support/create-agent.ts` walks; this file is only about
 * the band.
 */

/**
 * The create sheet itself, whichever screen it stands on.
 *
 * Found by the recipe's own slot rather than by an accessible name: each step
 * is titled with the question IT asks ("What do you want to add?", then
 * "Create a team"), so the surface's name changes as the flow walks while the
 * surface does not.
 */
export function createSheet(page: Page): Locator {
  return page.locator('[data-slot="flow-sheet"]');
}

/** Open the band's "+". Named by `shell:sidebar.createDialog`. */
export async function openCreateDialog(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Create", exact: true }).click();
}

/**
 * Start a new team. Leaves the sheet open on the team form for the caller.
 */
export async function startNewTeam(page: Page): Promise<void> {
  const direct = page.getByRole("button", { name: "New team", exact: true });
  if (await direct.isVisible()) await direct.click();
  else await openCreateDialog(page);
  // The opening choice, when the caller may create both things. With only
  // teams to create the sheet is already standing on the form.
  const card = createSheet(page).locator('[data-create-choice="team"]');
  const nameField = teamNameField(page);
  await card.or(nameField).first().waitFor({ state: "visible" });
  if (await card.isVisible()) await card.click();
  await nameField.waitFor({ state: "visible" });
}

/** The new team's name field, inside the sheet. */
export function teamNameField(page: Page): Locator {
  return createSheet(page).getByRole("textbox", { name: "Team name" });
}

/** Create a named team end to end: the sheet's choice, then its form. */
export async function createTeam(page: Page, name: string): Promise<void> {
  await startNewTeam(page);
  await teamNameField(page).fill(name);
  await createSheet(page).getByRole("button", { name: "Create team" }).click();
  await expect(rail(page).getByText(name, { exact: true })).toBeVisible();
}
