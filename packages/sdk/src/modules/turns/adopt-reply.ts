import { isCompactionSummary, isPendingInteraction } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import { finishResumed } from "./finish-resumed";
import { ENGINE_RESUMED_MESSAGE, STOPPED_BY_USER } from "./turn-errors";
import { interruptionNotice, timeLimitNotice } from "./turn-notices";
import {
  finishErr,
  finishOk,
  push,
  settleProviderErrorCard,
  type TurnState,
} from "./turn-settle";

export function adoptReply(
  s: TurnState,
  reply: ChatMessage,
  onAdoptTurnId?: (turnId: string) => void,
): void {
  if (reply.turnId !== undefined) {
    s.turnId ??= reply.turnId;
    onAdoptTurnId?.(reply.turnId);
  }
  foldPersistedTools(s, reply, !reply.stopped && !reply.interrupted);
  if (reply.providerError) {
    if (reply.content) s.text = reply.content;
    if (reply.thinking && !s.thinking) s.thinking = reply.thinking;
    settleProviderErrorCard(s, reply.providerError);
    return;
  }
  if (reply.stopped) {
    finishErr(s, STOPPED_BY_USER);
    return;
  }
  if (reply.interrupted) {
    if (reply.interrupted.resumed) finishResumed(s, ENGINE_RESUMED_MESSAGE);
    else {
      const line = interruptionNotice(reply.interrupted);
      finishErr(s, line.message, line.kind);
    }
    return;
  }
  s.text = isCompactionSummary(reply) ? "" : reply.content;
  if (reply.thinking && !s.thinking) s.thinking = reply.thinking;
  if (reply.usage) s.usage = reply.usage;
  const notice = timeLimitNotice(reply.stopReason);
  if (notice) {
    s.pendingInteraction = null;
    finishOk(s, notice);
    return;
  }
  if (isPendingInteraction(reply.pendingInteraction))
    s.pendingInteraction = reply.pendingInteraction;
  finishOk(s);
}

type PersistedTool = NonNullable<ChatMessage["tools"]>[number];

function foldPersistedTools(
  s: TurnState,
  reply: ChatMessage,
  reasoning: boolean,
): void {
  const tools = reply.tools ?? [];
  if (s.toolResultsSeen >= tools.length) return;
  if (reasoning && reply.thinking && !s.thinking) {
    s.thinking = reply.thinking;
    push(s, { feed_type: "thinking_streaming", data: s.thinking });
  }
  while (s.toolResultsSeen < Math.min(s.toolsSeen, tools.length))
    pushToolResult(s, tools[s.toolResultsSeen]);
  while (s.toolsSeen < tools.length) {
    const tool = tools[s.toolsSeen];
    push(s, {
      feed_type: "tool_call",
      data: { name: tool.name, input: tool.input ?? {} },
      toolIndex: s.toolsSeen,
    });
    s.toolsSeen++;
    pushToolResult(s, tool);
  }
}

function pushToolResult(s: TurnState, tool: PersistedTool): void {
  push(s, {
    feed_type: "tool_result",
    data: {
      name: tool.name,
      content: tool.result ?? "",
      is_error: !!tool.isError,
      ...(tool.mission ? { mission: tool.mission } : {}),
    },
    toolIndex: s.toolResultsSeen,
  });
  s.toolResultsSeen++;
}
