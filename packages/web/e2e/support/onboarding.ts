/**
 * First-run helpers: reaching the onboarding survey, and walking it.
 *
 * The survey (job → industry → what you'd love to automate) stands in front of
 * the create-your-assistant flow, so every spec that drives first-run has to
 * answer it before it reaches the step it actually tests. Centralised here so
 * a fourth question is a one-line change, not a sweep across five specs.
 */
import { FAKE_HOST_URL } from "@houston/fake-host";
import { type APIRequestContext, expect, type Page } from "@playwright/test";

/**
 * Write one ACCOUNT preference straight onto the host (`null` clears it) — the
 * keys `ACCOUNT_PREF_KEYS` routes off this device
 * (packages/web/src/engine-adapter/client/config-prefs-mixin.ts).
 */
export async function setAccountPreference(
  request: APIRequestContext,
  key: string,
  value: string | null,
): Promise<void> {
  await request.put(`${FAKE_HOST_URL}/v1/preferences/${key}`, {
    data: { value },
  });
}

/**
 * Empty the host's agents so the next `goto("/")` boots into the survey (v3
 * first-run = zero agents). The durable onboarding preferences need no clearing
 * here: the page fixture resets the whole fake host before every test, and each
 * test gets a fresh browser context (so the localStorage mirrors go too).
 */
export async function resetToFirstRun(
  request: APIRequestContext,
): Promise<void> {
  const agents = (await (
    await request.get(`${FAKE_HOST_URL}/agents`)
  ).json()) as { id: string }[];
  for (const agent of agents) {
    await request.delete(`${FAKE_HOST_URL}/agents/${agent.id}`);
  }
}

/**
 * The pre-survey answer as the shipped build stored it: a user who answered the
 * job question before industry + goal existed. Lifting this is what the
 * completion prompt exists for.
 */
export function legacySegmentPreference(segment = "operations"): string {
  return JSON.stringify({
    segment,
    selectedAt: "2026-01-01T00:00:00.000Z",
    sourceScreen: "first_run_segment",
  });
}

/**
 * Seed the pre-survey answer into the DEVICE mirror the old segment hook wrote
 * first, with nothing on the host. That is the state of a hosted user whose
 * engine write never landed (warming pod), and the only copy of their answer.
 */
export async function seedLegacySegmentMirror(
  page: Page,
  segment?: string,
): Promise<void> {
  await page.addInitScript((value: string) => {
    // Signed-out harness → the hook's uid-scoped key falls back to "local".
    localStorage.setItem("houston.onboarding-segment.local", value);
  }, legacySegmentPreference(segment));
}

/** Labels unique to ONE question, so a click can never hit the other grid
 *  ("Legal" and "Something else" appear in both). */
const JOB_ANSWER = "Operations";
const INDUSTRY_ANSWER = "Manufacturing";

/** Answer the job question (step 1 of the first-run survey). */
export async function answerJobStep(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "What best describes your work?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: JOB_ANSWER }).click();
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Answer the industry question (step 2). */
export async function answerIndustryStep(page: Page): Promise<void> {
  await page.getByRole("button", { name: INDUSTRY_ANSWER }).click();
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Answer the automation-goal question (step 3). It has no skip of its own:
 *  the only way past it is a valid answer, or the global escape hatch. */
export async function answerGoalStep(
  page: Page,
  goal = "Triage my inbox every morning.",
): Promise<void> {
  await page
    .getByRole("textbox", { name: "What would you love to automate?" })
    .fill(goal);
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Walk the whole first-run survey, landing on the create-your-assistant flow. */
export async function completeSurvey(page: Page): Promise<void> {
  await answerJobStep(page);
  await answerIndustryStep(page);
  await answerGoalStep(page);
}
