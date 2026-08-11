import { expect, test } from "./support/fixtures";
import {
  answerIndustryStep,
  answerJobStep,
  resetToFirstRun,
} from "./support/onboarding";

/**
 * The first-run survey is MANDATORY (Julian, Aug 2026): the three questions
 * carry no "Skip onboarding" escape hatch on any step — the only way forward
 * is answering. (The in-app profile-completion prompt keeps its "Not now";
 * that dismisses the prompt, not onboarding — onboarding-survey.spec.ts
 * covers it.)
 */
test("the first-run survey offers no skip on any of its three questions", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "What best describes your work?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skip onboarding" }),
  ).toHaveCount(0);

  await answerJobStep(page);
  await expect(
    page.getByRole("heading", { name: "What industry do you work in?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skip onboarding" }),
  ).toHaveCount(0);

  await answerIndustryStep(page);
  await expect(
    page.getByRole("heading", { name: "What would you love to automate?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Skip onboarding" }),
  ).toHaveCount(0);
});
