import type { ChatMessage } from "@houston/runtime-client";
import type { ChatHistoryEntry } from "../../../../ui/engine-client/src/types";
import { toOldProvider } from "./synthetic";

// The turn error/stop/not-connected classifiers moved into `@houston/sdk` with
// the turn machinery; re-exported here so the adapter's unit tests (and any
// legacy import) keep resolving them from this path.
export {
  isNotConnectedError,
  isStoppedByUser,
  turnErrorMessage,
} from "@houston/sdk";

/** Convert new-engine history (ChatMessage[]) into old FeedItem[] for replay. */
export function historyToFeed(messages: ChatMessage[]): ChatHistoryEntry[] {
  const out: ChatHistoryEntry[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      // Carry the author (C5) so a shared conversation attributes each teammate's
      // bubble on reload. Absent in single-player mode → the bubble is unchanged.
      out.push({
        feed_type: "user_message",
        data: m.content,
        author: m.author,
      });
    } else {
      // A persisted provider switch: replay the boundary divider before this
      // turn's content so it survives a reload (and the window estimate resets).
      if (m.providerSwitch) {
        out.push({
          feed_type: "provider_switched",
          data: {
            provider: toOldProvider(m.providerSwitch.provider),
            summarized: m.providerSwitch.summarized,
            pre_tokens: m.providerSwitch.pre_tokens,
          },
        });
      }
      // A persisted provider failure: replay the typed card so the inline
      // reconnect / rate-limit surface survives a reload (the dedup in
      // feedItemsToMessages keeps one card per (kind, provider) per turn).
      if (m.providerError) {
        out.push({
          feed_type: "provider_error",
          data: {
            ...m.providerError,
            provider: toOldProvider(m.providerError.provider),
          },
        });
      }
      for (const t of m.tools ?? []) {
        out.push({ feed_type: "tool_call", data: { name: t.name, input: {} } });
        out.push({
          feed_type: "tool_result",
          data: { content: "", is_error: !!t.isError },
        });
      }
      if (m.content) out.push({ feed_type: "assistant_text", data: m.content });
      // Replay the turn's usage as a final_result (which only flushes, never
      // renders a bubble) so the context-usage indicator survives a reload.
      if (m.usage) {
        out.push({
          feed_type: "final_result",
          data: {
            result: m.content,
            cost_usd: null,
            duration_ms: null,
            usage: m.usage,
          },
        });
      }
    }
  }
  return out;
}
