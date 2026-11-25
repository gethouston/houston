import type { TurnMode } from "@houston/protocol";
import { ASK_USER_TOOL_NAME } from "./tools/ask-user";
import { PLAN_READY_TOOL_NAME } from "./tools/plan-ready";

export const PLAN_MODE_TOOL_NAMES: readonly string[] = [
  "read",
  "ls",
  "grep",
  "find",
  ASK_USER_TOOL_NAME,
];

export function planToolNames(all: readonly string[]): string[] {
  return all.filter((name) => PLAN_MODE_TOOL_NAMES.includes(name));
}

export const AUTO_MODE_EXCLUDED_TOOL_NAMES: readonly string[] = [
  ASK_USER_TOOL_NAME,
];

export function autoToolNames(all: readonly string[]): string[] {
  return all.filter((name) => !AUTO_MODE_EXCLUDED_TOOL_NAMES.includes(name));
}

// WHY: Claude's built list may already hold plan_ready; strip it before the plan branch adds it. ADR-0012
export function toolNamesForMode(
  mode: TurnMode | undefined,
  all: readonly string[],
): string[] {
  const base = all.filter((name) => name !== PLAN_READY_TOOL_NAME);
  switch (mode) {
    case "plan":
      return [...planToolNames(base), PLAN_READY_TOOL_NAME];
    case "auto":
      return autoToolNames(base);
    default:
      return [...base];
  }
}
