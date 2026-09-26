import { expect, type Locator, type Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./composer";
import { rail } from "./team-nav";

/**
 * The "New AI Employee" row at the end of the rail — the door this flow walks.
 *
 * "New AI Employee" names two controls at once: this row at the foot of the
 * full list, and the Agents home's round button
 * (`agents-home-new-agent`, `agents-home-list.tsx`). The Agents home is mounted
 * for the whole session, so a page-wide lookup by accessible name matches both
 * and trips strict mode. The row's marker selects the rail control exactly.
 */
export function newAgentRow(page: Page): Locator {
  return rail(page)
    .locator("[data-sidebar-add-row]")
    .getByRole("button", { name: "New AI Employee" });
}

/**
 * Walk the hire path of the create sheet: the opening choice (when it is
 * shown), then the guided brief every from-scratch agent is created with
 * (`context-step.tsx` then `role-step.tsx`) — the industry it works in, then
 * the job it takes over. Each pick advances the dialog on its own, so this
 * leaves the caller on the customize step, where the name lives.
 *
 * The choice screen only exists when the user has an agent to copy
 * (`create-agent-steps-model.ts`), so this waits for
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
  await expect(
    page.getByRole("heading", { name: "Name your AI Employee", exact: true }),
  ).toBeVisible();
}

/**
 * Create an agent through the real sheet and return to a usable shell.
 *
 * The create sheet (`add-to-workspace-sheet.tsx`) opens on the choice of how
 * to start when it is reached from a "New AI Employee" control, and hiring
 * runs the three-step guided setup (context, role, then the employee card's
 * name and color). On
 * create success the sheet closes and the board opens on the new employee,
 * whose first day waits for the user's click (`lib/agent-first-day.ts`): no
 * setup task starts and no chat panel opens on its own.
 *
 * It asserts the panel stayed closed, so a regression back to an auto-started
 * first day fails loudly here instead of silently obstructing later steps.
 */
export async function createAgent(page: Page, name: string): Promise<void> {
  await newAgentRow(page).click();
  await fillAgentBrief(page);
  const nameField = page.getByRole("textbox", {
    name: "Name (Financial analyst)",
  });
  await nameField.waitFor({ state: "visible" });
  await nameField.fill(name);
  await page.getByRole("button", { name: "Create AI Employee" }).click();

  // Back in the shell: the sidebar (with its New-agent control) is interactive
  // again and the new agent is present in it.
  await expect(newAgentRow(page)).toBeVisible();
  await expect(
    page.locator("[data-tour-target='agents']").getByText(name).first(),
  ).toBeVisible();
  // The follow-up composer is what an open chat panel shows; with the first
  // day waiting for the user, nothing opens it.
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeHidden();
}

/**
 * Dismiss the open activity (chat) panel. Escape closes the mission
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
