/**
 * The persisted-history → feed fold: turn a conversation's `ChatMessage[]`
 * (the `getHistory` transcript) into the flat feed frames a client replays to
 * rebuild the chat.
 *
 * THE one implementation of that fold. The SDK uses it to seed a conversation's
 * reactive VM (the `turns/history` read and the `observe` hydration seam), and
 * the web engine-adapter delegates to it (`engine-adapter/translate.ts`) with
 * its OWN provider-id remap — so a wire change to what history carries lands in
 * exactly one place. The provider id is carried through untouched by default
 * (the SDK is provider-id-agnostic); a caller that renders old frontend ids
 * passes a `mapProvider`.
 */

import type { ChatMessage } from "@houston/runtime-client";

/**
 * One replayed feed frame: the SAME `{ feed_type, data }` push the turn
 * machinery emits, plus the optional multiplayer `author` on a user message
 * (carried so a shared conversation attributes each teammate's bubble on
 * reload). Plain JSON — it crosses the SDK/bridge boundary unchanged.
 */
export interface FeedFrame {
  feed_type: string;
  data: unknown;
  /** Multiplayer only: who wrote a `user_message`. Absent single-player. */
  author?: { userId: string; name?: string };
}

/** Identity provider map — the SDK default (carry the pi id through). */
const identityProvider = (id: string): string => id;

/**
 * Fold a conversation transcript into replayable feed frames. Mirrors the live
 * turn machinery's output so a seeded transcript and a live turn render the
 * same: streaming text collapses to one `assistant_text`, a persisted provider
 * switch/error replays its divider/card, and a turn's usage replays as an
 * (invisible) `final_result` so the context indicator survives a reload.
 */
export function historyToFeed(
  messages: ChatMessage[],
  mapProvider: (id: string) => string = identityProvider,
): FeedFrame[] {
  const out: FeedFrame[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({
        feed_type: "user_message",
        data: m.content,
        author: m.author,
      });
      continue;
    }
    // A persisted provider switch: replay the boundary divider before this
    // turn's content so it survives a reload (and the window estimate resets).
    if (m.providerSwitch) {
      out.push({
        feed_type: "provider_switched",
        data: {
          provider: mapProvider(m.providerSwitch.provider),
          summarized: m.providerSwitch.summarized,
          pre_tokens: m.providerSwitch.pre_tokens,
        },
      });
    }
    // A persisted proactive compaction: replay the boundary divider so it
    // (and the window reset) survives a reload.
    if (m.compaction) {
      out.push({
        feed_type: "context_compacted",
        data: {
          trigger: m.compaction.trigger,
          pre_tokens: m.compaction.pre_tokens,
        },
      });
    }
    // A persisted provider failure: replay the typed card so the inline
    // reconnect / rate-limit surface survives a reload.
    if (m.providerError) {
      out.push({
        feed_type: "provider_error",
        data: {
          ...m.providerError,
          provider: mapProvider(m.providerError.provider),
        },
      });
    }
    // Replay the turn's reasoning BEFORE its tool calls — the live VM keeps a
    // single thinking entry positioned where the first thinking block streamed
    // (ahead of the tools), so a reload renders the mission log in the same
    // order a live watcher saw (HOU-717).
    if (m.thinking) {
      out.push({ feed_type: "thinking", data: m.thinking });
    }
    for (const t of m.tools ?? []) {
      out.push({
        feed_type: "tool_call",
        data: { name: t.name, input: t.input ?? {} },
      });
      out.push({
        feed_type: "tool_result",
        data: { content: "", is_error: !!t.isError },
      });
    }
    if (m.content) out.push({ feed_type: "assistant_text", data: m.content });
    // A persisted file-change summary: replay it AFTER the assistant text so
    // the chat attaches it to this turn's assistant message on reload.
    if (m.fileChanges) {
      out.push({ feed_type: "file_changes", data: m.fileChanges });
    }
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
  return out;
}
