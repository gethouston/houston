import { expect, type Locator, type Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./composer";
import { rail } from "./team-nav";

/**
 * The DEFAULT team's "New AI Employee" row in the rail — the door this flow walks.
 *
 * "New AI Employee" names two controls at once: this row at the foot of an expanded
 * team block, and the Agents home's round button
 * (`agents-home-new-agent`, `agents-home-list.tsx`). The Agents home is mounted
 * for the whole session, so a page-wide lookup by accessible name matches both
 * and trips strict mode. Naming the block also fixes WHERE the agent lands: a
 * team's row creates into that team, and these flows want the default one.
 */
export function newAgentRow(page: Page): Locator {
  return rail(page)
    .locator('[data-sidebar-drop-section=""]')
    .getByRole("button", { name: "New AI Employee" });
}

/**
 * Walk the hire path of the create sheet: the opening choice (when it is
 * shown), then the guided brief every from-scratch agent is created with
 * (`context-step.tsx` then `role-step.tsx`) — the industry it works in, then
 * the job it takes over. Each pick advances the dialog on its own, so this
 * leaves the caller on the customize step, where the name lives.
 *
 * The choice screen only exists when the user has an agent to copy and no
 * tutorial is running (`create-agent-steps-model.ts`), so this waits for
 * whichever screen the sheet actually opened on before deciding — never a
 * bare visibility poll against a surface that is still mounting.
 *
 * Both brief answers are chips of the real catalog
 * (`agent-role-catalog-data.ts`) — one click each, exercising the control the
 * product ships.
 */
export async function fillAgentBrief(page: Page): Promise<void> {
  const hire = page.getByRole("button", { name: "Hire a new AI Employee" });
  const industry = page.getByRole("radio", { name: "Finance", exact: true });
  await hire.or(industry).first().waitFor({ state: "visible" });
  if (await hire.isVisible()) await hire.click();
  await industry.click();
  await page
    .getByRole("radio", { name: "Financial analyst", exact: true })
    .click();
}

/**
 * Create an agent through the real sheet and return to a usable shell.
 *
 * The create sheet (`add-to-workspace-sheet.tsx`) opens on the choice of how
 * to start when it is reached from a "New AI Employee" control, and hiring
 * runs the three-step guided setup (context, role, then name and color). On
 * create success the sheet
 * fires the agent's self-setup mission in the normal shell
 * (`startAgentSetupMission`), switches to the board view, auto-opens the chat
 * panel on that mission (`setActivityPanelId(conversationId, { forceOpen:
 * true })`), and closes immediately.
 *
 * This shared helper leaves callers on the board with the auto-opened panel
 * DISMISSED, so sidebar/board interactions aren't obstructed by the ~45%-width
 * chat panel. It asserts the panel really opened on the setup mission first, so
 * a broken auto-open fails loudly here instead of silently later.
 */
export async function createAgent(page: Page, name: string): Promise<void> {
  await newAgentRow(page).click();
  await fillAgentBrief(page);
  const nameField = page.getByPlaceholder("e.g. Product manager, Sales, Jerry");
  await nameField.waitFor({ state: "visible" });
  await nameField.fill(name);
  await page.getByRole("button", { name: "Create AI Employee" }).click();

  // The sheet closes and the setup-mission chat auto-opens as a right-side
  // panel. Its "Getting set up" mission uses the follow-up composer (an
  // existing conversation), so that composer is the stable "panel opened"
  // signal — independent of the setup-mission bubble copy.
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeVisible({
    timeout: 10_000,
  });

  await closeActivityPanel(page);

  // Back in the shell: the sidebar (with its New-agent control) is interactive
  // again and the new agent is present in it.
  await expect(newAgentRow(page)).toBeVisible();
  await expect(
    page.locator("[data-tour-target='agents']").getByText(name).first(),
  ).toBeVisible();
}

/**
 * Dismiss the auto-opened activity (chat) panel. Escape closes the mission
 * panel, but if the composer holds focus the first press only blurs it (and a
 * mid-flight streamed turn can swallow one press to stop streaming), so press
 * until the panel's composer is gone.
 */
export async function closeActivityPanel(page: Page): Promise<void> {
  const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(composer).toBeHidden({ timeout: 400 });
  }).toPass({ timeout: 5_000 });
}
