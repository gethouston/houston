import { SEED_AGENT_NAME } from "@houston/fake-host";
import type { Page } from "@playwright/test";
import { NEW_TASK_PLACEHOLDER } from "./composer";
import { expect } from "./fixtures";

export async function openNewMission(
  page: Page,
  agentName = SEED_AGENT_NAME,
): Promise<void> {
  await page
    .locator("[data-screen-active='true']")
    .locator('[data-tour-target="newMission"]')
    .first()
    .click();

  const composer = page.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  const agentChoice = page
    .getByRole("dialog")
    .getByRole("button", { name: agentName, exact: true });
  const connectAi = page.getByRole("button", { name: "Connect AI" });
  await composer
    .or(agentChoice)
    .or(connectAi)
    .first()
    .waitFor({ state: "visible" });
  if (await agentChoice.isVisible()) await agentChoice.click();
}

export async function startMission(page: Page, text: string): Promise<void> {
  await page.goto("/");
  await openNewMission(page);
  const composer = page.getByPlaceholder(NEW_TASK_PLACEHOLDER);
  await expect(composer).toBeVisible();
  await composer.fill(text);
  await composer.press("Enter");
  await expect(page.getByText(/Roger that\. You said:/)).toBeVisible({
    timeout: 15_000,
  });
}
