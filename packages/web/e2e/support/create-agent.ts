import { expect, type Locator, type Page } from "@playwright/test";
import { FOLLOW_UP_PLACEHOLDER } from "./composer";
import { prefilledName } from "./employee-name";

export function newAgentButton(page: Page): Locator {
  return page.locator(
    "[data-tour-target='sidebar'] [data-tour-target='newAgent']",
  );
}

export async function openNewAgent(page: Page): Promise<void> {
  await newAgentButton(page).click();
  const item = page.getByRole("menuitem", { name: "New AI Employee" });
  await item.or(page.getByRole("dialog")).first().waitFor();
  if (await item.isVisible()) await item.click();
}

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

export async function createAgent(page: Page, name: string): Promise<void> {
  await openNewAgent(page);
  await fillAgentBrief(page);
  const nameField = page.getByRole("textbox", {
    name: "Name (Financial analyst)",
  });
  await expect(nameField).toHaveValue(prefilledName("Financial analyst"));
  await nameField.fill(name);
  await page.getByRole("button", { name: "Create AI Employee" }).click();

  await expect(newAgentButton(page)).toBeVisible();
  await expect(
    page.locator("[data-tour-target='agents']").getByText(name).first(),
  ).toBeVisible();
  await expect(page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER)).toBeHidden();
}

export async function closeActivityPanel(page: Page): Promise<void> {
  const composer = page.getByPlaceholder(FOLLOW_UP_PLACEHOLDER);
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(composer).toBeHidden({ timeout: 400 });
  }).toPass({ timeout: 5_000 });
}
