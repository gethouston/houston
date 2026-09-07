import type {
  HookCallback,
  HookCallbackMatcher,
} from "@anthropic-ai/claude-agent-sdk";
import { currentTurnFinish } from "../../session/interaction";

/**
 * The Claude twin of pi's tool-result `terminate` hint. On the pi path a tool
 * result can end the agent loop by itself; the SDK's in-process MCP transport
 * carries no such field, so this PostToolBatch hook asks the turn instead:
 * once every tool of the batch has run, if one of them marked the turn ended
 * (an offer tool after the closing message, see session/turn-finish.ts), it
 * answers `continue: false` and the subprocess stops without calling the
 * model again — the reply and the offers come from ONE model pass. Otherwise
 * it answers nothing and the turn proceeds as before.
 *
 * PostToolBatch rather than PostToolUse so a sibling offer later in the same
 * batch (`suggest_reusable` next to `suggest_actions`) still runs before the
 * stop. Verified against SDK 0.3.257: a hook-ended turn yields a `result` of
 * `subtype: "success"` with an empty result string (no error card), every
 * tool of the batch ran, and the session resumes normally on the next prompt.
 * The hook runs in THIS process, dispatched by the same subprocess-stream
 * reader the MCP tool handlers run on, so the per-turn interaction store
 * propagates into it exactly as it does into the tools (custom-tools.ts);
 * outside a turn the mark reads false and the hook stays silent.
 */

/** Stop the subprocess after a batch in which a tool marked the turn ended. */
export const endTurnIfRequested: HookCallback = async () =>
  currentTurnFinish()?.turnEndedByTool
    ? { continue: false, stopReason: "Follow-up offers recorded." }
    : {};

/** The SDK `hooks` option: one PostToolBatch hook, every batch. */
export function buildTurnEndHooks(): { PostToolBatch: HookCallbackMatcher[] } {
  return { PostToolBatch: [{ hooks: [endTurnIfRequested] }] };
}
