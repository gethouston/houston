import { expect, type Locator, type Page } from "@playwright/test";
import { viewMoreProviders } from "./connect-ai";
import { type PressMode, press } from "./mobile-nav";

export type ManagerStepId =
  | "survey-industry"
  | "survey-role"
  | "survey-companySize"
  | "survey-goal"
  | "team-basic-industry"
  | "team-basic";

export const INDUSTRY_ANSWER = "Accounting";
export const ROLE_ANSWER = "Bookkeeper";
export const COMPANY_SIZE_ANSWER = "2–10";
export const GOAL_ANSWER = "Chase my overdue invoices every Monday";

export const INDUSTRY_QUESTION = "What industry do you work in?";
export const ROLE_QUESTION = "What's your role?";
export const COMPANY_SIZE_QUESTION = "How big is your company?";
export const GOAL_QUESTION =
  "What's a repetitive task in your job that you'd love to hire somebody for?";

export function managerOnboarding(page: Page): Locator {
  return page.getByTestId("manager-onboarding");
}

export function onboardingPrompt(page: Page): Locator {
  return page.getByTestId("manager-onboarding-prompt");
}

export function managerStep(page: Page, id: ManagerStepId): Locator {
  return page.locator(`[data-testid="manager-step"][data-step="${id}"]`);
}

export function connectAiStep(page: Page): Locator {
  return page.getByTestId("manager-connect-ai");
}

export function chip(step: Locator, label: string): Locator {
  return step.getByRole("radio", { name: label, exact: true });
}

export async function pickChip(
  page: Page,
  id: ManagerStepId,
  label: string,
  mode: PressMode = "click",
): Promise<void> {
  const step = managerStep(page, id);
  await expect(step).toBeVisible();
  await press(chip(step, label), mode);
}

export function stepContinue(page: Page, id: ManagerStepId): Locator {
  return managerStep(page, id).getByRole("button", {
    name: "Continue",
    exact: true,
  });
}

export function stepBack(page: Page, id: ManagerStepId): Locator {
  return managerStep(page, id).getByRole("button", {
    name: "Back",
    exact: true,
  });
}

export function companySizeButton(page: Page, label: string): Locator {
  return chip(managerStep(page, "survey-companySize"), label);
}

export async function answerCompanySize(
  page: Page,
  mode: PressMode = "click",
  label: string = COMPANY_SIZE_ANSWER,
): Promise<void> {
  await expect(managerStep(page, "survey-companySize")).toBeVisible();
  await press(companySizeButton(page, label), mode);
}

export function goalField(page: Page): Locator {
  return managerStep(page, "survey-goal").getByRole("textbox", {
    name: GOAL_QUESTION,
  });
}

export async function answerGoal(
  page: Page,
  mode: PressMode = "click",
  goal: string = GOAL_ANSWER,
): Promise<void> {
  const card = managerStep(page, "survey-goal");
  await expect(card).toBeVisible();
  await goalField(page).fill(goal);
  await press(
    card.getByRole("button", { name: "Continue", exact: true }),
    mode,
  );
}

export function receipt(page: Page, answerText: string | RegExp): Locator {
  return managerOnboarding(page)
    .locator('[data-conversation-message-key^="user-"]')
    .filter({ hasText: answerText });
}

export function changeAnswer(page: Page): Locator {
  return page.getByTestId("manager-change-answer");
}

export async function connectAi(
  page: Page,
  mode: PressMode = "click",
  next: ManagerStepId = "survey-industry",
): Promise<void> {
  const step = connectAiStep(page);
  await expect(step).toBeVisible();
  await press(viewMoreProviders(page), mode);
  await step.getByPlaceholder("Search providers").fill("openrouter");
  await press(step.getByRole("button", { name: "Connect OpenRouter" }), mode);
  await page
    .getByPlaceholder("Paste your API key")
    .fill("sk-or-e2e-onboarding");
  await press(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Connect", exact: true }),
    mode,
  );
  await expect(managerStep(page, next)).toBeVisible();
}

export async function answerSurvey(
  page: Page,
  mode: PressMode = "click",
): Promise<void> {
  await pickChip(page, "survey-industry", INDUSTRY_ANSWER, mode);
  await pickChip(page, "survey-role", ROLE_ANSWER, mode);
  await answerCompanySize(page, mode);
  await answerGoal(page, mode);
  await expect(managerStep(page, "team-basic")).toBeVisible();
}

export async function reachTeamStep(
  page: Page,
  mode: PressMode = "click",
): Promise<void> {
  await connectAi(page, mode);
  await answerSurvey(page, mode);
}
