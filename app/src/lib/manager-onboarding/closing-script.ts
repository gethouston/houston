import type { OnboardingSurveyPreference } from "../onboarding-survey-record.ts";
import type { ManagerReach, ScriptLine, ScriptPrompt } from "./script-types.ts";

export function closingPart(
  lines: ScriptLine[],
  survey: OnboardingSurveyPreference | null,
  reach: ManagerReach | null,
): ScriptPrompt {
  if (reach === null) {
    lines.push({ kind: "manager", key: "closingTeam", id: "closingTeam" });
    return { kind: "openChat" };
  }
  lines.push({
    kind: "manager",
    key: "closingTeam",
    id: "closingTeam",
    reach: { ...reach, invite: reach.invite && survey?.companySize !== "solo" },
  });
  if ((survey?.automationGoal ?? null) === null)
    lines.push({ kind: "manager", key: "closingAsk", id: "closingAsk" });
  return { kind: "openChat" };
}

export function closingManagerVariant(
  reach: ManagerReach,
): "all" | "invite" | "connect" | "core" {
  if (reach.invite && reach.connect) return "all";
  if (reach.invite) return "invite";
  if (reach.connect) return "connect";
  return "core";
}
