import type { FeedItem } from "@houston-ai/chat";

export type ProviderHandoffMode = "replay" | "summarize";

export const REPLAY_FIT_FRACTION = 0.8;

export function estimateConversationTokens(
  items: FeedItem[] | undefined,
): number {
  if (!items) return 0;
  let chars = 0;
  for (const item of items) {
    if (
      (item.feed_type === "user_message" ||
        item.feed_type === "assistant_text") &&
      typeof item.data === "string"
    ) {
      chars += item.data.length;
    }
  }
  return Math.ceil(chars / 4);
}

export function decideHandoffMode(args: {
  currentContextTokens: number | null;
  estimatedTokens: number;
  targetWindowTokens: number | null | undefined;
}): ProviderHandoffMode {
  if (args.targetWindowTokens == null) return "summarize";
  const size = Math.max(args.currentContextTokens ?? 0, args.estimatedTokens);
  return size <= args.targetWindowTokens * REPLAY_FIT_FRACTION
    ? "replay"
    : "summarize";
}
