import type {
  HookCallback,
  HookCallbackMatcher,
} from "@anthropic-ai/claude-agent-sdk";
import { currentTurnFinish } from "../../session/interaction";

export const endTurnIfRequested: HookCallback = async () =>
  currentTurnFinish()?.turnEndedByTool
    ? { continue: false, stopReason: "Follow-up offers recorded." }
    : {};

export function buildTurnEndHooks(): { PostToolBatch: HookCallbackMatcher[] } {
  return { PostToolBatch: [{ hooks: [endTurnIfRequested] }] };
}
