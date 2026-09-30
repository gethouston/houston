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
 * - `medium` / `high` — reasoning ON at the matching effort.
 * - `xhigh` — pi's ceiling → the SDK's maximum effort (`max`).
 *
 * Reasoning is never disabled: every model the anthropic provider offers
 * (Sonnet 5.5, Opus 5.5, Fable 5.1) is always-thinking, and pi lists neither
 * `off` nor `minimal` for them, so `minimal` takes the lowest level they run.
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
      return { thinking: { type: "enabled" }, effort: "max" };
  }
}
