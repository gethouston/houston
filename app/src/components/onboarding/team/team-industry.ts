import { AGENT_ROLE_PART_MAX_LENGTH } from "../../../lib/agent-role-context.ts";
import {
  NO_SURVEY_ROLE,
  type SurveyIndustryContext,
  type SurveyRoleContext,
} from "../../../lib/onboarding-industry-context.ts";
import type { AgentRoleStart } from "../../shell/use-agent-role-state.ts";

const TRAILING_SEPARATORS = /[\s,;:/&-]+$/u;

export function capAnswerLabel(
  label: string,
  max: number = AGENT_ROLE_PART_MAX_LENGTH,
): string {
  const clean = label
    .replace(/\p{Cf}/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const points = [...clean];
  if (points.length <= max) return clean;
  const head = points.slice(0, max + 1).join("");
  const lastSpace = head.lastIndexOf(" ");
  const cut =
    lastSpace > 0 ? head.slice(0, lastSpace) : points.slice(0, max).join("");
  return cut.replace(TRAILING_SEPARATORS, "");
}

export function surveyRoleStart(
  industry: SurveyIndustryContext,
  role: SurveyRoleContext = NO_SURVEY_ROLE,
): AgentRoleStart {
  const words = (label: string | null) => (label ? capAnswerLabel(label) : "");
  return {
    contextId: industry.contextId,
    customContext:
      industry.contextId === null ? words(industry.customLabel) : "",
    roleId: role.roleId,
    customRole: role.roleId === null ? words(role.customLabel) : "",
  };
}
