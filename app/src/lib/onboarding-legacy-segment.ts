import {
  createOnboardingSurveyPreference,
  type OnboardingSurveyPreference,
} from "./onboarding-survey-record.ts";

export const ONBOARDING_SEGMENT_PREF_KEY = "houston_onboarding_segment";

const LEGACY_SOURCE_SCREEN = "first_run_segment";

export interface LegacySegmentPreference {
  segment: string;
  selectedAt: string;
}

export function parseLegacySegmentPreference(
  raw: string | null,
): LegacySegmentPreference | null {
  if (!raw?.trim()) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  if (
    typeof record.segment !== "string" ||
    record.segment.trim() === "" ||
    typeof record.selectedAt !== "string" ||
    record.sourceScreen !== LEGACY_SOURCE_SCREEN
  )
    return null;
  return { segment: record.segment, selectedAt: record.selectedAt };
}

export function onboardingSegmentLocalKey(uid: string | null): string {
  return `houston.onboarding-segment.${uid ?? "local"}`;
}

export function liftLegacySegmentPreference(
  legacy: LegacySegmentPreference | null,
): OnboardingSurveyPreference | null {
  if (!legacy) return null;
  return {
    ...createOnboardingSurveyPreference(),
    segment: legacy.segment,
    updatedAt: Number.isNaN(Date.parse(legacy.selectedAt))
      ? new Date().toISOString()
      : legacy.selectedAt,
  };
}
