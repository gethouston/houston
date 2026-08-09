import { expect, test } from "./support/fixtures";
import {
  answerGoalStep,
  answerIndustryStep,
  answerJobStep,
  legacySegmentPreference,
  resetToFirstRun,
  seedLegacySegmentMirror,
  setAccountPreference,
} from "./support/onboarding";

/**
 * The onboarding survey: what the user does, the industry they do it in, and
 * the one thing they would love to automate.
 *
 * It is mounted from two places, and both are guarded here:
 *   - FIRST RUN — all three questions, ahead of the create-your-assistant flow.
 *     Answers persist to the account preference, so a reload never re-asks.
 *   - PROFILE COMPLETION — the in-app prompt for someone who answered the job
 *     question before the other two existed (the shipped
 *     `houston_onboarding_segment` preference, lifted). It asks only the gaps,
 *     and "Not now" is remembered.
 */

const CONNECT_STEP = "Connect your AI";
const JOB_QUESTION = "What best describes your work?";
const INDUSTRY_QUESTION = "What industry do you work in?";
const GOAL_QUESTION = "What would you love to automate?";
const COMPLETION_PROMPT = "Help us tailor Houston to you";
/** The workspace shell's own main region (`workspace-shell.tsx`). `getByRole`
 *  is ambiguous here — the agent canvas nests a second <main> inside it. */
const SHELL = 'main[data-tour-target="main"]';

test("first run walks the three questions and never asks again", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await page.goto("/");

  // STEP 1 — the job question. Continue stays disabled until a pill is picked.
  await expect(page.getByRole("heading", { name: JOB_QUESTION })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await answerJobStep(page);

  // STEP 2 — industry. A fresh question, so Continue is disabled again, and
  // Back is offered now that there is somewhere to go back to.
  await expect(
    page.getByRole("heading", { name: INDUSTRY_QUESTION }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
  await answerIndustryStep(page);

  // STEP 3 — the automation goal, in the user's own words.
  await expect(
    page.getByRole("heading", { name: GOAL_QUESTION }),
  ).toBeVisible();
  await answerGoalStep(page, "Triage my inbox every morning.");

  // The survey hands off to the create-your-assistant flow, which opens
  // directly on its connect step (the welcome/intro screen was removed).
  await expect(page.getByRole("heading", { name: CONNECT_STEP })).toBeVisible();

  // Answered is answered: a reload lands back on the connect step, with no
  // question of the three re-asked.
  await page.reload();
  await expect(page.getByRole("heading", { name: CONNECT_STEP })).toBeVisible();
  for (const question of [JOB_QUESTION, INDUSTRY_QUESTION, GOAL_QUESTION]) {
    await expect(page.getByRole("heading", { name: question })).toHaveCount(0);
  }
});

test("an answer whose push failed rides along on the next one", async ({
  page,
  request,
}) => {
  // The account store is a MIRROR of the answers, and a save that lands stamps
  // the whole record as synced. So a push must carry everything the record
  // holds: with a per-answer delta, a job answer whose PUT failed was never
  // sent again (the stamp the industry's success earned suppressed the
  // catch-up), and that user's segment was lost to the cohort forever.
  await resetToFirstRun(request);

  const pushed: Array<Record<string, unknown>> = [];
  await page.route("**/v1/me/onboarding", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    pushed.push(JSON.parse(route.request().postData() ?? "{}"));
    // The FIRST push (the job answer) never lands.
    await route.fulfill({
      status: pushed.length === 1 ? 503 : 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  await page.goto("/");
  await answerJobStep(page);
  await answerIndustryStep(page);
  await expect(
    page.getByRole("heading", { name: GOAL_QUESTION }),
  ).toBeVisible();

  await expect.poll(() => pushed.length).toBeGreaterThanOrEqual(2);
  expect(pushed[0]).toMatchObject({ segment: "operations" });
  // The push that DOES land carries the dropped answer with it.
  expect(pushed.at(-1)).toMatchObject({
    segment: "operations",
    industry: "manufacturing",
  });
});

test("Back returns to the previous question with the answer still selected", async ({
  page,
  request,
}) => {
  await resetToFirstRun(request);
  await page.goto("/");

  await answerJobStep(page);
  await expect(
    page.getByRole("heading", { name: INDUSTRY_QUESTION }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByRole("heading", { name: JOB_QUESTION })).toBeVisible();
  // The pill is still pressed, so Continue is live: going back must not cost
  // the user the answer they already gave.
  await expect(
    page.getByRole("button", { name: "Operations" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
});

test("the automation goal offers no skip, and Continue waits for an answer", async ({
  page,
  request,
}) => {
  // The step used to carry a "Skip this question" link, and it was taken by
  // reflex rather than by decision. It is gone: an empty field simply holds
  // Continue shut, and leaving is the global escape hatch (onboarding-skip).
  await resetToFirstRun(request);
  await page.goto("/");

  await answerJobStep(page);
  await answerIndustryStep(page);
  await expect(
    page.getByRole("heading", { name: GOAL_QUESTION }),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: "Skip this question" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

  // Whitespace is not an answer either, and typing one enables Continue.
  const field = page.getByRole("textbox", { name: GOAL_QUESTION });
  await field.fill("   ");
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
  await field.fill("Triage my inbox every morning.");
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
});

test("a user with only the job answered is prompted for the rest, once", async ({
  page,
  request,
}) => {
  // The shipped build's preference, and nothing else: this account answered the
  // job question before industry + goal existed. An agent exists, so the boot
  // routes to the shell and the prompt is what stands in front of it.
  await setAccountPreference(
    request,
    "houston_onboarding_segment",
    legacySegmentPreference(),
  );

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: COMPLETION_PROMPT }),
  ).toBeVisible();
  // Only the GAPS are asked — the job question is already answered.
  await expect(page.getByText(INDUSTRY_QUESTION)).toBeVisible();
  await expect(page.getByText(JOB_QUESTION)).toHaveCount(0);

  await answerIndustryStep(page);
  await answerGoalStep(page, "Draft replies to anything urgent.");

  // Survey finished: the shell takes over and the prompt is gone for good.
  await expect(
    page.getByRole("heading", { name: COMPLETION_PROMPT }),
  ).toHaveCount(0);
  await expect(page.locator(SHELL)).toBeVisible();

  await page.reload();
  await expect(page.locator(SHELL)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: COMPLETION_PROMPT }),
  ).toHaveCount(0);
});

test("a job answer that only ever reached this device is still lifted", async ({
  page,
}) => {
  // No host preference at all: the answer survived only in the device mirror
  // the old segment hook wrote FIRST (its engine write failed on a warming
  // pod). Dropping that copy would re-ask the one question this user answered.
  await seedLegacySegmentMirror(page);

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: COMPLETION_PROMPT }),
  ).toBeVisible();
  await expect(page.getByText(INDUSTRY_QUESTION)).toBeVisible();
  await expect(page.getByText(JOB_QUESTION)).toHaveCount(0);
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

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: COMPLETION_PROMPT }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Not now" }).click();
  await expect(
    page.getByRole("heading", { name: COMPLETION_PROMPT }),
  ).toHaveCount(0);
  await expect(page.locator(SHELL)).toBeVisible();

  // The dismissal is stored on the account, not just this render: a reload
  // must not re-interrupt someone who already said no.
  await page.reload();
  await expect(page.locator(SHELL)).toBeVisible();
  await expect(
    page.getByRole("heading", { name: COMPLETION_PROMPT }),
  ).toHaveCount(0);
});
