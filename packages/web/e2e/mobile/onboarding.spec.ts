import type { Locator, Page } from "@playwright/test";
import { evictMidClosing, holdClosingSave } from "../support/closing-save";
import { expect, test } from "../support/fixtures";
import {
  answerCompanySize,
  answerGoal,
  answerSurvey,
  companySizeButton,
  connectAi,
  connectAiStep,
  goalField,
  INDUSTRY_ANSWER,
  managerOnboarding,
  managerStep,
  pickChip,
  ROLE_ANSWER,
} from "../support/manager-onboarding";
import {
  finishOnboarding,
  HIRE_ONE_MORE,
  hireStarterTeam,
  roster,
  STARTER_ROLES,
  starterTeam,
  teamNext,
} from "../support/manager-team";
import { awaitAgentsHome, navBar } from "../support/mobile-nav";
import { openManagerOnboarding, resetToFirstRun } from "../support/onboarding";
import {
  expectLatestLinesClearOfStep,
  scrollLogToStart,
} from "../support/onboarding-scroll";

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectFullWidth(page: Page, control: Locator) {
  const box = await control.boundingBox();
  const viewport = page.viewportSize();
  if (!box || !viewport) throw new Error("the control did not lay out");
  expect(box.width).toBeGreaterThan(viewport.width * 0.7);
}

async function expectNoZoomOnFocus(field: Locator) {
  const size = await field.evaluate((node) =>
    Number.parseFloat(getComputedStyle(node).fontSize),
  );
  expect(size).toBeGreaterThanOrEqual(16);
}

test("first run completes on a phone: connect, survey, first hire, the app", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await resetToFirstRun(request);
  await openManagerOnboarding(page);

  await expect(
    managerOnboarding(page).getByTestId("assistant-back"),
  ).toBeVisible();
  await expect(navBar(page)).toHaveCount(0);
  await expect(connectAiStep(page)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await connectAi(page, "tap");

  const industry = managerStep(page, "survey-industry");
  const search = industry.getByPlaceholder("Search industries");
  await expectFullWidth(page, search);
  await expectNoZoomOnFocus(search);
  await expectFullWidth(
    page,
    industry.getByRole("button", { name: "Something else" }),
  );
  await expectNoHorizontalOverflow(page);
  await expectLatestLinesClearOfStep(page);
  await pickChip(page, "survey-industry", INDUSTRY_ANSWER, "tap");
  await expectLatestLinesClearOfStep(page);
  await scrollLogToStart(page);
  await pickChip(page, "survey-role", ROLE_ANSWER, "tap");
  await expectLatestLinesClearOfStep(page);

  const [small, next] = await Promise.all([
    companySizeButton(page, "Just me").boundingBox(),
    companySizeButton(page, "2–10").boundingBox(),
  ]);
  if (!small || !next) throw new Error("the buckets did not lay out");
  expect(small.height).toBeGreaterThanOrEqual(44);
  expect(next.y).toBe(small.y);
  expect(next.x).toBeGreaterThan(small.x);
  await expectNoHorizontalOverflow(page);
  await answerCompanySize(page, "tap");
  await expectLatestLinesClearOfStep(page);

  await expectNoZoomOnFocus(goalField(page));
  const goal = managerStep(page, "survey-goal");
  await expectFullWidth(page, goal.getByRole("button", { name: "Continue" }));
  await expect(goal.getByRole("button", { name: "Skip" })).toHaveCount(0);
  await goalField(page).focus();
  await expectLatestLinesClearOfStep(page);
  await answerGoal(page, "tap");
  await expectNoHorizontalOverflow(page);
  await expectLatestLinesClearOfStep(page);

  await hireStarterTeam(page, ["Avery", "Felix", "Nora"], "tap", STARTER_ROLES);
  await expectNoHorizontalOverflow(page);
  await finishOnboarding(page);

  await page.getByTestId("assistant-back").tap();
  await expect(navBar(page)).toBeVisible();
  const row = await awaitAgentsHome(page);
  await expect(row).toContainText("Avery");
  await expectNoHorizontalOverflow(page);
});

test("the starter team's buttons are sized for the thumb", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await connectAi(page, "tap");
  await answerSurvey(page, "tap");
  const step = starterTeam(page);
  const hire = step.getByRole("button", { name: "Hire my team" });
  expect((await hire.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await expectFullWidth(page, hire);
  const more = step.getByRole("button", { name: HIRE_ONE_MORE, exact: true });
  expect((await more.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  const remove = step.getByRole("button", {
    name: `Remove ${STARTER_ROLES[0]}`,
    exact: true,
  });
  expect((await remove.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);
  await expectLatestLinesClearOfStep(page);
});

test("a tab evicted mid-onboarding resumes on the step the user left", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await expect(connectAiStep(page)).toBeVisible();

  await page.reload();
  await expect(connectAiStep(page)).toBeVisible();

  await connectAi(page, "tap");
  await answerSurvey(page, "tap");
  const release = await holdClosingSave(request);
  await hireStarterTeam(page, null, "tap", STARTER_ROLES);
  const resumed = await evictMidClosing(page);
  await release();
  await expect(teamNext(resumed)).toBeVisible();
  await expect(roster(resumed).locator('li[data-status="hired"]')).toHaveCount(
    3,
  );
  await expect(navBar(resumed)).toHaveCount(0);
});
