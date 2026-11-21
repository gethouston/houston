import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  answerCompanySize,
  answerGoal,
  connectAi,
  connectAiStep,
  INDUSTRY_ANSWER,
  managerOnboarding,
  managerStep,
  onboardingPrompt,
  pickChip,
  ROLE_ANSWER,
} from "./support/manager-onboarding";
import { openManagerOnboarding, resetToFirstRun } from "./support/onboarding";

async function expectNoWayOut(page: Page): Promise<void> {
  const prompt = onboardingPrompt(page);
  await expect(prompt).toBeVisible();
  await expect(
    prompt.getByRole("button", { name: /^(Not now|Skip onboarding)/ }),
  ).toHaveCount(0);
  const goalFields = await managerStep(page, "survey-goal")
    .locator("textarea")
    .count();
  await expect(managerOnboarding(page).locator("textarea")).toHaveCount(
    goalFields,
  );
}

test("no first-run step before the team offers a way out", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);

  await expect(connectAiStep(page)).toBeVisible();
  await expectNoWayOut(page);
  await connectAi(page);

  await expectNoWayOut(page);
  await page.keyboard.press("Escape");
  await expect(managerStep(page, "survey-industry")).toBeVisible();
  await pickChip(page, "survey-industry", INDUSTRY_ANSWER);

  await expect(managerStep(page, "survey-role")).toBeVisible();
  await expectNoWayOut(page);
  await pickChip(page, "survey-role", ROLE_ANSWER);

  await expect(managerStep(page, "survey-companySize")).toBeVisible();
  await expectNoWayOut(page);
  await page.keyboard.press("Escape");
  await expect(managerStep(page, "survey-companySize")).toBeVisible();
  await answerCompanySize(page);

  await expect(managerStep(page, "survey-goal")).toBeVisible();
  await expectNoWayOut(page);
  await page.keyboard.press("Escape");
  await expect(managerStep(page, "survey-goal")).toBeVisible();
  await answerGoal(page);
  await expect(managerStep(page, "team-basic")).toBeVisible();
});
