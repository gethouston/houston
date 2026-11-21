import { FAKE_HOST_URL } from "@houston/fake-host";
import { type APIRequestContext, expect, type Page } from "@playwright/test";

export const SURVEY_PREF_KEY = "houston_onboarding_survey";

export async function setAccountPreference(
  request: APIRequestContext,
  key: string,
  value: string | null,
): Promise<void> {
  await request.put(`${FAKE_HOST_URL}/v1/preferences/${key}`, {
    data: { value },
  });
}

export async function readAccountPreference(
  request: APIRequestContext,
  key: string,
): Promise<string | null> {
  const response = await request.get(`${FAKE_HOST_URL}/v1/preferences/${key}`);
  const body = (await response.json()) as { value: string | null };
  return body.value;
}

export interface StoredSurvey {
  segment: string | null;
  role: string | null;
  roleOther: string | null;
  industry: string | null;
  industryOther: string | null;
  companySize?: string | null;
  automationGoal: string | null;
  goalSkipped: boolean;
}

export async function readSurveyRecord(
  request: APIRequestContext,
): Promise<StoredSurvey | null> {
  const raw = await readAccountPreference(request, SURVEY_PREF_KEY);
  return raw === null ? null : (JSON.parse(raw) as StoredSurvey);
}

export async function seedAnsweredSurvey(
  request: APIRequestContext,
  industry: string,
  role = "operations_manager",
): Promise<void> {
  await setAccountPreference(
    request,
    SURVEY_PREF_KEY,
    JSON.stringify({
      version: 2,
      segment: null,
      role,
      roleOther: null,
      industry,
      industryOther: null,
      companySize: "2_10",
      automationGoal: "Stay on top of my email",
      goalSkipped: false,
      completionPromptDismissed: false,
      updatedAt: "2026-01-01T00:00:00.000Z",
      gatewaySyncedAt: "2026-01-01T00:00:00.000Z",
    }),
  );
}

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

export async function openManagerOnboarding(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByTestId("manager-onboarding")).toBeVisible({
    timeout: 15_000,
  });
}

export function legacySegmentPreference(segment = "operations"): string {
  return JSON.stringify({
    segment,
    selectedAt: "2026-01-01T00:00:00.000Z",
    sourceScreen: "first_run_segment",
  });
}

export async function seedLegacySegmentMirror(
  page: Page,
  segment?: string,
): Promise<void> {
  await page.addInitScript((value: string) => {
    localStorage.setItem("houston.onboarding-segment.local", value);
  }, legacySegmentPreference(segment));
}
