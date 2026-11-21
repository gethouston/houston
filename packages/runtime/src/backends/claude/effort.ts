import type {
  EffortLevel,
  ThinkingConfig,
} from "@anthropic-ai/claude-agent-sdk";
import type { ThinkingLevel } from "../types";

export interface SdkEffort {
  thinking: ThinkingConfig;
  effort: EffortLevel;
}

export function toSdkEffort(level: ThinkingLevel): SdkEffort {
  switch (level) {
    case "minimal":
    case "low":
      return { thinking: { type: "enabled" }, effort: "low" };
    case "medium":
      return { thinking: { type: "enabled" }, effort: "medium" };
    case "high":
      return { thinking: { type: "enabled" }, effort: "high" };
    case "xhigh":
      return { thinking: { type: "enabled" }, effort: "xhigh" };
  }
}
