import type { Page } from "@playwright/test";
import { expect, test } from "./support/fixtures";
import {
  answerCompanySize,
  answerGoal,
  COMPANY_SIZE_ANSWER,
  GOAL_ANSWER,
  INDUSTRY_ANSWER,
  managerOnboarding,
  managerStep,
  pickChip,
} from "./support/manager-onboarding";
import {
  legacySegmentPreference,
  readSurveyRecord,
  SURVEY_PREF_KEY,
  seedLegacySegmentMirror,
  setAccountPreference,
} from "./support/onboarding";
import { missionCard } from "./support/team-nav";

const INTRO = /^Hi again!/;

async function bootExistingAccount(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
}

async function expectNoPrompt(page: Page): Promise<void> {
  await expect(missionCard(page, "Plan a trip to Tokyo")).toBeVisible();
  await expect(managerOnboarding(page)).toHaveCount(0);
}

test("a user who answered the department is asked the rest in the manager's chat, once", async ({
  page,
  request,
}) => {
  await setAccountPreference(
    request,
    "houston_onboarding_segment",
    legacySegmentPreference(),
  );
  await bootExistingAccount(page);

  const chat = managerOnboarding(page);
  await expect(chat.getByText(INTRO)).toBeVisible();
  const industry = managerStep(page, "survey-industry");
  await expect(industry).toBeVisible();
  await expect(industry.getByRole("button", { name: "Not now" })).toBeVisible();

  await pickChip(page, "survey-industry", INDUSTRY_ANSWER);
  await expect(managerStep(page, "survey-role")).toHaveCount(0);
  await expect(
    managerStep(page, "survey-companySize").getByRole("button", {
      name: "Not now",
    }),
  ).toBeVisible();
  await answerCompanySize(page);
  await expect(
    managerStep(page, "survey-goal").getByRole("button", {
      name: "Not now",
    }),
  ).toBeVisible();
  await answerGoal(page);

  await expect(chat.getByText("Thanks, that helps me a lot.")).toBeVisible();
  await page
    .getByTestId("manager-finish")
    .getByRole("button", { name: "Continue", exact: true })
    .click();
  const realChat = page.getByTestId("assistant-chat");
  await expect(realChat).toBeVisible();
  await expect(managerOnboarding(page)).toHaveCount(0);
  await expect(realChat.getByText(INTRO)).toBeVisible();
  await expect(realChat.getByText(COMPANY_SIZE_ANSWER)).toBeVisible();
  await expect(realChat.getByText(GOAL_ANSWER)).toBeVisible();
  await expect(
    realChat.getByText("Thanks, that helps me a lot."),
  ).toBeVisible();
  await expect
    .poll(() => readSurveyRecord(request))
    .toMatchObject({
      segment: "operations",
      role: null,
      industry: "accounting",
      companySize: "2_10",
      automationGoal: GOAL_ANSWER,
    });

  await page.reload();
  await expectNoPrompt(page);
});

test("a job answer that only ever reached this device is still lifted", async ({
  page,
}) => {
  await seedLegacySegmentMirror(page);
  await bootExistingAccount(page);

  await expect(managerOnboarding(page).getByText(INTRO)).toBeVisible();
  await expect(managerStep(page, "survey-industry")).toBeVisible();
});

test('"Not now" dismisses the completion prompt for good', async ({
  page,
  request,
}) => {
  await setAccountPreference(
    request,
    "houston_onboarding_segment",
    legacySegmentPreference(),
  );
  await bootExistingAccount(page);

  const industry = managerStep(page, "survey-industry");
  await expect(industry).toBeVisible();
  await industry.getByRole("button", { name: "Not now" }).click();
  await expect(managerOnboarding(page)).toHaveCount(0);
  await expect(page.getByTestId("assistant-chat")).toBeVisible();

  await page.reload();
  await expectNoPrompt(page);
});

test("an account that finished the survey before the company size is asked it alone, once", async ({
  page,
  request,
}) => {
  await setAccountPreference(
    request,
    SURVEY_PREF_KEY,
    JSON.stringify({
      version: 2,
      segment: null,
      role: "founder",
      roleOther: null,
      industry: "accounting",
      industryOther: null,
      automationGoal: GOAL_ANSWER,
      goalSkipped: false,
      completionPromptDismissed: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
      gatewaySyncedAt: "2026-01-01T00:00:00.000Z",
    }),
  );
  await bootExistingAccount(page);

  const size = managerStep(page, "survey-companySize");
  await expect(size).toBeVisible();
  await expect(managerStep(page, "survey-industry")).toHaveCount(0);
  await expect(managerStep(page, "survey-goal")).toHaveCount(0);

  await size.getByRole("button", { name: "Not now" }).click();
  await expect(managerOnboarding(page)).toHaveCount(0);
  await page.reload();
  await expectNoPrompt(page);
});
