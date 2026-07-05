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
 * - `minimal` — reasoning OFF (`thinking: disabled`) at the lowest effort.
 * - `low` / `medium` / `high` — reasoning ON at the matching effort.
 * - `xhigh` — pi's ceiling → the SDK's maximum effort (`max`).
 *
 * pi enables reasoning only when a level is set (see `ai/effort.ts`), so this
 * mirrors that: only `minimal` disables thinking; every other level enables it.
 */
export function toSdkEffort(level: ThinkingLevel): SdkEffort {
  switch (level) {
    case "minimal":
      return { thinking: { type: "disabled" }, effort: "low" };
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
