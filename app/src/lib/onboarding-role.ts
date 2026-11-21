import {
  ONBOARDING_ANSWER_SKIPPED,
  ONBOARDING_ANSWER_SOMETHING_ELSE,
} from "@houston/wire-types";
import { type AgentRoleId, isAgentRoleId } from "./agent-role-catalog.ts";
import {
  isLeadershipRoleId,
  type LeadershipRoleId,
} from "./leadership-roles.ts";

export const ONBOARDING_ROLE_SOMETHING_ELSE = ONBOARDING_ANSWER_SOMETHING_ELSE;

export type OnboardingRoleId = AgentRoleId | LeadershipRoleId;

export type OnboardingRole =
  | OnboardingRoleId
  | typeof ONBOARDING_ROLE_SOMETHING_ELSE;

export const ONBOARDING_ROLE_SKIPPED = ONBOARDING_ANSWER_SKIPPED;

export type OnboardingRoleChoice =
  | OnboardingRole
  | typeof ONBOARDING_ROLE_SKIPPED;

export function isOnboardingRole(value: unknown): value is OnboardingRole {
  return (
    value === ONBOARDING_ROLE_SOMETHING_ELSE ||
    isAgentRoleId(value) ||
    isLeadershipRoleId(value)
  );
}

export function isOnboardingRoleChoice(
  value: unknown,
): value is OnboardingRoleChoice {
  return value === ONBOARDING_ROLE_SKIPPED || isOnboardingRole(value);
}

export function normalizeOnboardingRoleChoice(
  value: unknown,
): OnboardingRoleChoice | null {
  if (typeof value !== "string" || value.length === 0) return null;
  return isOnboardingRoleChoice(value) ? value : ONBOARDING_ROLE_SOMETHING_ELSE;
}
