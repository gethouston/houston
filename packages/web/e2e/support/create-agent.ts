import { expect, type Locator, type Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./composer";
import { prefilledName } from "./employee-name";

/**
 * The rail's "+" on its top line — the door this flow walks. Its tour anchor
 * scopes it to the rail: the Agents home's round button carries the same
 * anchor and stays mounted for the session.
 */
export function newAgentButton(page: Page): Locator {
  return page.locator(
    "[data-tour-target='sidebar'] [data-tour-target='newAgent']",
  );
}

/**
 * Press the "+" and land on the create sheet. Where the person may also make
 * a group, the "+" opens a two-item menu first, and the flow picks "New AI
 * Employee" from it; otherwise the sheet opens straight away.
 */
export async function openNewAgent(page: Page): Promise<void> {
  await newAgentButton(page).click();
  const item = page.getByRole("menuitem", { name: "New AI Employee" });
  await item.or(page.getByRole("dialog")).first().waitFor();
  if (await item.isVisible()) await item.click();
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
  const hire = page.getByRole("button", { name: "Create a new AI Employee" });
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
 * runs the three-step guided setup (context, role, then the employee card,
 * which arrives named for the job and is renamed to `name` here). On
 * create success the sheet closes and the board opens on the new employee,
 * whose first day waits for the user's click (`lib/agent-first-day.ts`): no
 * setup task starts and no chat panel opens on its own.
 *
 * It asserts the panel stayed closed, so a regression back to an auto-started
 * first day fails loudly here instead of silently obstructing later steps.
 */
export async function createAgent(page: Page, name: string): Promise<void> {
  await openNewAgent(page);
  await fillAgentBrief(page);
  const nameField = page.getByRole("textbox", {
    name: "Name (Financial analyst)",
  });
  await expect(nameField).toHaveValue(prefilledName("Financial analyst"));
  await nameField.fill(name);
  await page.getByRole("button", { name: "Create AI Employee" }).click();

  // Back in the shell: the sidebar (with its New-agent control) is interactive
  // again and the new agent is present in it.
  await expect(newAgentButton(page)).toBeVisible();
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
