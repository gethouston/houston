export type PiThinkingLevel = "minimal" | "low" | "medium" | "high" | "xhigh";

export const DEFAULT_REASONING_EFFORT = "medium";

export function toThinkingLevel(
  effort: string | null | undefined,
): PiThinkingLevel | undefined {
  switch (effort) {
    case "minimal":
      return "minimal";
    case "low":
      return "low";
    case "medium":
      return "medium";
    case "high":
      return "high";
    case "xhigh":
      return "xhigh";
    case "max":
      return "xhigh";
    default:
      return undefined;
  }
}
