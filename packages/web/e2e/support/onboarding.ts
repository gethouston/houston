/**
 * First-run helpers: reaching onboarding, and walking it.
 *
 * First-run onboarding is three full-screen cards outside the app shell: the
 * survey (job → industry → what you'd love to automate), "Connect your AI",
 * then "Build your team". Every spec that drives first-run walks the cards in
 * front of the one it tests; centralised here so a new question or card is a
 * one-line change, not a sweep across every spec.
 */
import { FAKE_HOST_URL } from "@houston/fake-host";
import { type APIRequestContext, expect, type Page } from "@playwright/test";
import { viewMoreProviders } from "./connect-ai";

/**
 * Write one ACCOUNT preference straight onto the host (`null` clears it) — the
 * keys `ACCOUNT_PREF_KEYS` routes off this device
 * (packages/engine-adapter/src/client/config-prefs-mixin.ts).
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
export const INDUSTRY_ANSWER = "Manufacturing";

/** Answer the job question (step 1 of the first-run survey). */
export async function answerJobStep(page: Page): Promise<void> {
  await expect(
    page.getByRole("heading", { name: "What best describes your work?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: JOB_ANSWER }).click();
  await page.getByRole("button", { name: "Continue" }).click();
}

/** Answer the industry question (step 2). Its chips are a radio group. */
export async function answerIndustryStep(page: Page): Promise<void> {
  await page.getByRole("radio", { name: INDUSTRY_ANSWER }).click();
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

/** Walk the whole first-run survey, landing on the "Connect your AI" card. */
export async function completeSurvey(page: Page): Promise<void> {
  await answerJobStep(page);
  await answerIndustryStep(page);
  await answerGoalStep(page);
}

/** The "Connect your AI" card's heading. */
export function connectAiHeading(page: Page) {
  return page.getByRole("heading", { name: "Connect your AI" });
}

/** The "Build your team" card's heading. */
export function buildTeamHeading(page: Page) {
  return page.getByRole("heading", { name: "Build your team" });
}

/**
 * Connect a provider on the "Connect your AI" card through the api-key path
 * (the fake host accepts any key), found in the full list "View more" opens.
 * The card advances by itself once the provider is confirmed connected,
 * landing on "Build your team".
 */
export async function connectAiOnCard(page: Page): Promise<void> {
  await expect(connectAiHeading(page)).toBeVisible();
  await viewMoreProviders(page).click();
  await page.getByPlaceholder("Search providers").fill("openrouter");
  await page.getByRole("button", { name: "Connect OpenRouter" }).click();
  await page
    .getByPlaceholder("Paste your API key")
    .fill("sk-or-e2e-onboarding");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Connect", exact: true })
    .click();
  await expect(buildTeamHeading(page)).toBeVisible();
}

/** Walk first-run up to the "Build your team" card: survey, then connect. */
export async function reachBuildTeamCard(page: Page): Promise<void> {
  await completeSurvey(page);
  await connectAiOnCard(page);
}
