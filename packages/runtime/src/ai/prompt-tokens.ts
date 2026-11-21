import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  calculateContextTokens,
  estimateTokens,
} from "@earendil-works/pi-coding-agent";

type AgentMessage = Parameters<typeof estimateTokens>[0];

export function estimatePromptTokens(context: {
  systemPrompt?: string;
  messages: readonly AgentMessage[];
}): number {
  const { messages } = context;
  let trailing = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message === undefined) continue;
    const measured = measuredUsage(message);
    if (measured !== undefined) return measured + trailing;
    trailing += estimateTokens(message);
  }
  return trailing + Math.ceil((context.systemPrompt?.length ?? 0) / 4);
}

function measuredUsage(message: AgentMessage): number | undefined {
  if (message.role !== "assistant") return undefined;
  const { usage, stopReason } = message as AssistantMessage;
  if (stopReason === "error" || stopReason === "aborted") return undefined;
  const tokens = usage ? calculateContextTokens(usage) : 0;
  return tokens > 0 ? tokens : undefined;
}
