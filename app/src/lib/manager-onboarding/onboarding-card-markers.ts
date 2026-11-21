import type { ManagerReach } from "./script-types.ts";

const TEAM_PREFIX = "<!--houston:onboarding-team ";
const GOAL_PREFIX = "<!--houston:onboarding-goal ";
const SUFFIX = "-->";

export interface TeamCardPayload {
  reach: ManagerReach | null;
}

export interface GoalCardPayload {
  goal: string;
}

function markerJson(value: unknown): string {
  return JSON.stringify(value).replaceAll(">", "\\u003e");
}

function decode(content: string, prefix: string): unknown {
  if (!content.startsWith(prefix)) return null;
  const end = content.indexOf(SUFFIX, prefix.length);
  if (end < 0) return null;
  try {
    return JSON.parse(content.slice(prefix.length, end));
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReach(value: unknown): value is ManagerReach {
  return (
    isRecord(value) &&
    typeof value.invite === "boolean" &&
    typeof value.connect === "boolean"
  );
}

export function encodeTeamCard(payload: TeamCardPayload, text: string): string {
  return `${TEAM_PREFIX}${markerJson(payload)}${SUFFIX}\n\n${text}`;
}

export function decodeTeamCard(content: string): TeamCardPayload | null {
  const value = decode(content, TEAM_PREFIX);
  if (!isRecord(value)) return null;
  if (value.reach === null) return { reach: null };
  return isReach(value.reach) ? { reach: value.reach } : null;
}

export function encodeGoalCard(payload: GoalCardPayload): string {
  return `${GOAL_PREFIX}${markerJson(payload)}${SUFFIX}`;
}

export function decodeGoalCard(content: string): GoalCardPayload | null {
  const value = decode(content, GOAL_PREFIX);
  return isRecord(value) && typeof value.goal === "string"
    ? { goal: value.goal }
    : null;
}
