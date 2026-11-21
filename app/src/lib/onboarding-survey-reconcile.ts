import {
  type OnboardingSurveyPreference,
  sameSurveyAnswers,
} from "./onboarding-survey.ts";

export interface ReconciledSurvey {
  record: OnboardingSurveyPreference;
  healEngine: boolean;
}

function sameRecord(
  a: OnboardingSurveyPreference,
  b: OnboardingSurveyPreference,
): boolean {
  return (
    sameSurveyAnswers(a, b) &&
    a.completionPromptDismissed === b.completionPromptDismissed &&
    a.updatedAt === b.updatedAt &&
    a.gatewaySyncedAt === b.gatewaySyncedAt
  );
}

function resolveTie(
  mirror: OnboardingSurveyPreference,
  engine: OnboardingSurveyPreference,
  completionPromptDismissed: boolean,
): OnboardingSurveyPreference {
  if (!sameSurveyAnswers(mirror, engine))
    return { ...engine, completionPromptDismissed, gatewaySyncedAt: null };
  return {
    ...engine,
    completionPromptDismissed,
    gatewaySyncedAt: engine.gatewaySyncedAt ?? mirror.gatewaySyncedAt,
  };
}

export function reconcileSurveyCopies(
  mirror: OnboardingSurveyPreference,
  engine: OnboardingSurveyPreference,
): ReconciledSurvey {
  const completionPromptDismissed =
    mirror.completionPromptDismissed || engine.completionPromptDismissed;
  const mirrorAt = Date.parse(mirror.updatedAt);
  const engineAt = Date.parse(engine.updatedAt);
  const ordered =
    !Number.isNaN(mirrorAt) && !Number.isNaN(engineAt) && mirrorAt !== engineAt;
  const record = ordered
    ? {
        ...(mirrorAt > engineAt ? mirror : engine),
        completionPromptDismissed,
      }
    : resolveTie(mirror, engine, completionPromptDismissed);
  return { record, healEngine: !sameRecord(record, engine) };
}
