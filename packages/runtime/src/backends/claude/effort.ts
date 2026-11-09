import type {
  EffortLevel,
  ThinkingConfig,
} from "@anthropic-ai/claude-agent-sdk";
import type { ThinkingLevel } from "../types";

/**
 * The reasoning knobs the Claude Agent SDK takes for one query: a `thinking`
 * config (enabled/disabled) plus an `effort` level that guides how deep the model
 * reasons. Both are set together so a level maps to an unambiguous SDK request.
 */
export interface SdkEffort {
  thinking: ThinkingConfig;
  effort: EffortLevel;
}

/**
 * Map pi's `ThinkingLevel` to the SDK's `{ thinking, effort }`.
 *
 * - `minimal` / `low` — reasoning ON at the lowest effort.
 * - `medium` / `high` / `xhigh` — reasoning ON at the matching SDK effort.
 *
 * Reasoning is never disabled: Houston never turns thinking off on the
 * anthropic lineup (Sonnet 5.5, Opus 5.5, Fable 5.2, Haiku 5.5). A stored
 * `minimal` takes the lowest effort they all support.
 */
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
