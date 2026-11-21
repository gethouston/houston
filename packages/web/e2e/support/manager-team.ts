import { expect, type Locator, type Page } from "@playwright/test";
import { prefilledName } from "./employee-name";
import {
  GOAL_ANSWER,
  managerOnboarding,
  managerStep,
} from "./manager-onboarding";
import { type PressMode, press } from "./mobile-nav";

export const HIRE_ONE_MORE = "Hire one more";
export const TEAM_DONE_CHOICE = "That's my team";

export const STARTER_ROLES = [
  "Executive assistant",
  "Bookkeeper",
  "Accounts payable clerk",
] as const;

export const ADDED_ROLE = "Operations coordinator";

export function roster(page: Page): Locator {
  return page.getByTestId("manager-roster");
}

export function starterTeam(page: Page): Locator {
  return managerStep(page, "team-basic");
}

export function employeeNameField(scope: Locator, role: string): Locator {
  return scope.getByRole("textbox", { name: `Name (${role})` });
}

export function teamNext(page: Page): Locator {
  return page.getByTestId("manager-team-next");
}

export async function afterHire(
  page: Page,
  choice: typeof TEAM_DONE_CHOICE | typeof HIRE_ONE_MORE,
  mode: PressMode = "click",
): Promise<void> {
  await press(
    teamNext(page).getByRole("button", { name: choice, exact: true }),
    mode,
  );
}

export async function addStarterCard(
  page: Page,
  mode: PressMode = "click",
): Promise<void> {
  const step = starterTeam(page);
  await press(
    step.getByRole("button", { name: HIRE_ONE_MORE, exact: true }),
    mode,
  );
  await expect(employeeNameField(step, ADDED_ROLE)).toBeVisible();
}

export function removeStarterCard(page: Page, name: string): Locator {
  return starterTeam(page).getByRole("button", {
    name: `Remove ${name}`,
    exact: true,
  });
}

export async function hireStarterTeam(
  page: Page,
  names: readonly string[] | null,
  mode: PressMode = "click",
  roles: readonly string[] = STARTER_ROLES,
): Promise<string[]> {
  const step = starterTeam(page);
  await expect(
    step.getByRole("heading", { name: "Meet your new team" }),
  ).toBeVisible();
  await expect(step.getByText(/Everything here is editable/)).toBeVisible();
  const hired: string[] = [];
  for (const [index, role] of roles.entries()) {
    const field = employeeNameField(step, role);
    await expect(field).toHaveValue(prefilledName(role));
    if (names) await field.fill(names[index]);
    hired.push(await field.inputValue());
  }
  await press(step.getByRole("button", { name: "Hire my team" }), mode);
  const conversation = managerOnboarding(page).or(
    page.getByTestId("assistant-chat"),
  );
  const list = new Intl.ListFormat("en", { type: "conjunction" }).format(hired);
  await expect(conversation.getByText(list)).toBeVisible({ timeout: 15_000 });
  await expect(
    conversation.getByText("Your team is ready!", { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  return hired;
}

export const CLOSING_LINES = [
  "Your team is ready!",
  "Open any of your AI Employees to give them work directly.",
] as const;
export const MANAGER_ABILITIES = [
  "Hand out missions",
  "Hire new AI Employees",
] as const;

export function teamCard(scope: Page | Locator): Locator {
  return scope.getByTestId("onboarding-team-card");
}

export function goalCard(scope: Page | Locator): Locator {
  return scope.getByTestId("onboarding-goal-card");
}

export async function expectClosing(
  page: Page,
  goal: string = GOAL_ANSWER,
): Promise<void> {
  const chat = page.getByTestId("assistant-chat");
  const card = teamCard(chat);
  for (const line of [...CLOSING_LINES, ...MANAGER_ABILITIES])
    await expect(card.getByText(line, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
  await expect(goalCard(chat).getByText(`“${goal}”`)).toBeVisible();
}

export async function finishOnboarding(page: Page): Promise<void> {
  const chat = page.getByTestId("assistant-chat");
  await expect(chat).toBeVisible({ timeout: 15_000 });
  await expect(managerOnboarding(page)).toHaveCount(0);
  await expect(teamCard(chat)).toBeVisible();
  await expect(goalCard(chat)).toBeVisible();
}
