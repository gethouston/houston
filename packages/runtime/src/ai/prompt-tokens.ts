import type { AssistantMessage } from "@earendil-works/pi-ai";
import {
  calculateContextTokens,
  estimateTokens,
} from "@earendil-works/pi-coding-agent";

/** pi's session message (its agent core, which this package does not import). */
type AgentMessage = Parameters<typeof estimateTokens>[0];

/**
 * The size of the prompt a request to the model sends: the last answered
 * request's measured usage, which covers the system prompt, the tools and
 * every message before it, plus pi's character estimate of each message
 * since. With no answered request yet, everything is estimated.
 *
 * This is pi's own `estimateContextTokens` rule (not exported by the
 * package), so it can overcount after a compaction: the usage then predates
 * the summary. An overcount only lengthens the first-byte deadline.
 */
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

/** A finished answer's full context size; a failed or empty one has none. */
function measuredUsage(message: AgentMessage): number | undefined {
  if (message.role !== "assistant") return undefined;
  const { usage, stopReason } = message as AssistantMessage;
  if (stopReason === "error" || stopReason === "aborted") return undefined;
  const tokens = usage ? calculateContextTokens(usage) : 0;
  return tokens > 0 ? tokens : undefined;
}
