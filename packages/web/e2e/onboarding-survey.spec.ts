import { expect, test } from "./support/fixtures";
import {
  answerCompanySize,
  answerGoal,
  COMPANY_SIZE_ANSWER,
  COMPANY_SIZE_QUESTION,
  changeAnswer,
  chip,
  companySizeButton,
  connectAi,
  GOAL_ANSWER,
  GOAL_QUESTION,
  goalField,
  INDUSTRY_ANSWER,
  INDUSTRY_QUESTION,
  managerStep,
  pickChip,
  ROLE_ANSWER,
  ROLE_QUESTION,
  receipt,
  stepContinue,
} from "./support/manager-onboarding";
import {
  openManagerOnboarding,
  readSurveyRecord,
  resetToFirstRun,
} from "./support/onboarding";
import { expectLatestLinesClearOfStep } from "./support/onboarding-scroll";

test("the four questions follow the connection, save, and are never asked again", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await connectAi(page);

  const industry = managerStep(page, "survey-industry");
  await expect(
    industry.getByRole("heading", { name: INDUSTRY_QUESTION }),
  ).toBeVisible();
  await expect(industry.getByPlaceholder("Search industries")).toBeVisible();
  await expect(
    industry.getByRole("button", { name: "Something else" }),
  ).toBeVisible();
  await expectLatestLinesClearOfStep(page);
  await pickChip(page, "survey-industry", INDUSTRY_ANSWER);

  const role = managerStep(page, "survey-role");
  await expect(
    role.getByRole("heading", { name: ROLE_QUESTION }),
  ).toBeVisible();
  await expect(role.getByText("Leadership", { exact: true })).toBeVisible();
  await expect(chip(role, "Founder")).toBeVisible();
  await expect(chip(role, ROLE_ANSWER)).toBeVisible();
  await expect(role.getByText("More roles", { exact: true })).toBeVisible();
  await expectLatestLinesClearOfStep(page);
  await pickChip(page, "survey-role", ROLE_ANSWER);

  const size = managerStep(page, "survey-companySize");
  await expect(size).toContainText(COMPANY_SIZE_QUESTION);
  for (const bucket of ["Just me", "2–10", "11–50", "51–200", "201–1,000"])
    await expect(companySizeButton(page, bucket)).toBeVisible();
  await expect(companySizeButton(page, "1,000+")).toBeVisible();
  await expect(size.getByRole("button", { name: "Not now" })).toHaveCount(0);
  await expectLatestLinesClearOfStep(page);
  await answerCompanySize(page);

  const goal = managerStep(page, "survey-goal");
  await expect(goal).toContainText(GOAL_QUESTION);
  const send = goal.getByRole("button", { name: "Continue", exact: true });
  await expect(send).toBeDisabled();
  await expectLatestLinesClearOfStep(page);
  await answerGoal(page);

  await expect(managerStep(page, "team-basic")).toBeVisible();
  await expectLatestLinesClearOfStep(page);
  for (const answered of [
    INDUSTRY_ANSWER,
    ROLE_ANSWER,
    COMPANY_SIZE_ANSWER,
    GOAL_ANSWER,
  ])
    await expect(receipt(page, answered)).toBeVisible();
  await expect
    .poll(() => readSurveyRecord(request))
    .toMatchObject({
      segment: null,
      industry: "accounting",
      role: "bookkeeper",
      companySize: "2_10",
      automationGoal: GOAL_ANSWER,
    });

  await page.reload();
  await expect(managerStep(page, "team-basic")).toBeVisible();
  await expect(receipt(page, GOAL_ANSWER)).toBeVisible();
  await expect(managerStep(page, "survey-industry")).toHaveCount(0);
  await expect(managerStep(page, "survey-role")).toHaveCount(0);
  await expect(managerStep(page, "survey-companySize")).toHaveCount(0);
  await expect(managerStep(page, "survey-goal")).toHaveCount(0);
});

test("a leadership position answers the role, and the company size resumes and changes", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await connectAi(page);
  await pickChip(page, "survey-industry", INDUSTRY_ANSWER);

  const role = managerStep(page, "survey-role");
  await role.getByPlaceholder("Search roles").fill("founder");
  await expect(chip(role, "Co-founder")).toBeVisible();
  await pickChip(page, "survey-role", "Founder");
  await expect(managerStep(page, "survey-companySize")).toBeVisible();
  await expect(receipt(page, "Founder")).toBeVisible();
  await expect
    .poll(async () => (await readSurveyRecord(request))?.role)
    .toBe("founder");

  await changeAnswer(page).click();
  await expect(
    chip(managerStep(page, "survey-role"), "Founder"),
  ).toHaveAttribute("aria-checked", "true");
  await stepContinue(page, "survey-role").click();

  await page.reload();
  await expect(managerStep(page, "survey-companySize")).toBeVisible();
  await answerCompanySize(page, "click", "Just me");
  await expect(managerStep(page, "survey-goal")).toBeVisible();
  await expect(receipt(page, "Just me")).toBeVisible();
  await changeAnswer(page).click();
  await expect(companySizeButton(page, "Just me")).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await answerCompanySize(page, "click", "11–50");
  await expect(receipt(page, "11–50")).toBeVisible();
  await expect
    .poll(async () => (await readSurveyRecord(request))?.companySize)
    .toBe("11_50");
});

test("a reload between questions resumes on the one still to answer", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await connectAi(page);
  await pickChip(page, "survey-industry", INDUSTRY_ANSWER);
  await expect(managerStep(page, "survey-role")).toBeVisible();

  await page.reload();
  await expect(managerStep(page, "survey-role")).toBeVisible();
  await expect(receipt(page, INDUSTRY_ANSWER)).toBeVisible();
  await expect(managerStep(page, "survey-industry")).toHaveCount(0);
});

test("the role question searches the whole catalog and takes the person's own words", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await connectAi(page);
  await pickChip(page, "survey-industry", INDUSTRY_ANSWER);

  const role = managerStep(page, "survey-role");
  const search = role.getByPlaceholder("Search roles");
  await search.fill("paralegal");
  await expect(chip(role, "Paralegal")).toBeVisible();

  await search.fill("Dog groomer");
  await role
    .getByRole("button", { name: 'Use "Dog groomer" as the role' })
    .click();
  await role.getByRole("button", { name: "Continue", exact: true }).click();

  await expect(managerStep(page, "survey-companySize")).toBeVisible();
  await expect(receipt(page, "Dog groomer")).toBeVisible();
  await expect
    .poll(() => readSurveyRecord(request))
    .toMatchObject({ role: "something_else", roleOther: "Dog groomer" });
});

test("the goal is sent with Enter, breaks lines with Shift+Enter, and can be skipped", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await connectAi(page);
  await pickChip(page, "survey-industry", INDUSTRY_ANSWER);
  await pickChip(page, "survey-role", ROLE_ANSWER);
  await answerCompanySize(page);

  const field = goalField(page);
  await field.fill("Reply to leads");
  await field.press("Shift+Enter");
  await field.pressSequentially("and book calls");
  await expect(field).toHaveValue("Reply to leads\nand book calls");
  await field.press("Enter");
  await expect(managerStep(page, "team-basic")).toBeVisible();
  await expect
    .poll(async () => (await readSurveyRecord(request))?.automationGoal)
    .toBe("Reply to leads\nand book calls");

  await changeAnswer(page).click();
  await expect(goalField(page)).toHaveValue("Reply to leads\nand book calls");
  await expect(
    managerStep(page, "survey-goal").getByRole("button", { name: "Skip" }),
  ).toHaveCount(0);
});

test("Change answer asks the latest question again, the answer still picked", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await openManagerOnboarding(page);
  await connectAi(page);
  await pickChip(page, "survey-industry", INDUSTRY_ANSWER);
  await expect(managerStep(page, "survey-role")).toBeVisible();

  await expect(changeAnswer(page)).toHaveCount(1);
  await changeAnswer(page).click();
  const industry = managerStep(page, "survey-industry");
  await expect(chip(industry, INDUSTRY_ANSWER)).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await stepContinue(page, "survey-industry").click();
  await expect(managerStep(page, "survey-role")).toBeVisible();

  await pickChip(page, "survey-role", ROLE_ANSWER);
  await expect(changeAnswer(page)).toHaveCount(1);
  await changeAnswer(page).click();
  const role = managerStep(page, "survey-role");
  await expect(chip(role, ROLE_ANSWER)).toHaveAttribute("aria-checked", "true");
  await pickChip(page, "survey-role", "Payroll specialist");

  await expect(receipt(page, "Payroll specialist")).toBeVisible();
  await expect(managerStep(page, "survey-companySize")).toBeVisible();
  await expect
    .poll(async () => (await readSurveyRecord(request))?.role)
    .toBe("payroll_specialist");
});
