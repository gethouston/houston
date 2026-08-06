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
import { STOPPED_BY_USER } from "./turn-errors";
import type { FeedAuthor, FeedMention } from "./vm-output";

/**
 * One replayed feed frame: the SAME `{ feed_type, data }` push the turn
 * machinery emits, plus the optional multiplayer `author` on a user message
 * (carried so a shared conversation attributes each teammate's bubble on
 * reload). Plain JSON — it crosses the SDK/bridge boundary unchanged.
 */
export interface FeedFrame {
  feed_type: string;
  data: unknown;
  /** Multiplayer only: who wrote a `user_message`. Absent single-player. The
   *  seed/prepend folds carry it onto the feed entry (`FeedItemVM.author`), so
   *  a reloaded shared conversation attributes every teammate's bubble. */
  author?: FeedAuthor;
  /** The teammates a `user_message` @mentions (HOU-944). The seed/prepend folds
   *  carry it onto the feed entry (`FeedItemVM.mentions`), so a reloaded shared
   *  conversation chips the same names the sent bubble did. Absent when the
   *  message mentioned nobody. */
  mentions?: FeedMention[];
  /**
   * Epoch-ms timestamp of the source `ChatMessage` this frame was folded from
   * (`ChatMessage.ts`). Carried on every frame attributable to a message so a
   * client can render a relative time on reload. Optional/additive: absent for
   * pre-`ts` transcripts and for frames not tied to a message. Plain JSON — it
   * crosses the SDK/bridge boundary unchanged.
   */
  ts?: number;
  /**
   * The turn this frame's source message belongs to (`ChatMessage.turnId`) —
   * the identity the VM fold dedupes on (HOU-1214): a live sink re-delivering
   * this turn's content (a running-sync replay over a seeded feed, a settle
   * re-push) updates the SAME entries instead of appending duplicates.
   * Optional/additive: absent on pre-turn-id transcripts, which keep the
   * append-only fold.
   */
  turnId?: string;
  /**
   * This frame's position among the turn's `tool_call`s (or `tool_result`s) —
   * the per-turn index that pairs a replayed tool row with the seeded entry it
   * duplicates (tool rows are many-per-turn, so `turnId` alone can't). Only on
   * tool frames, and only when `turnId` is present.
   */
  toolIndex?: number;
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
    // Every frame folded from a message carries that message's epoch-ms `ts`
    // (additive; a pre-`ts` transcript simply folds frames with `ts: undefined`)
    // and its `turnId` — the dedup identity the VM fold matches live re-pushes
    // against (HOU-1214).
    const ts = m.ts;
    const turn = m.turnId !== undefined ? { turnId: m.turnId } : {};
    if (m.role === "user") {
      out.push({
        feed_type: "user_message",
        // Render displayText when the stored prompt carried text the user should
        // never see (a hidden directive / appended attachment paths); the model
        // ran on `content`, but the bubble shows what the user actually meant.
        data: m.displayText ?? m.content,
        author: m.author,
        mentions: m.mentions,
        ts,
        ...turn,
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
        ts,
        ...turn,
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
        ts,
        ...turn,
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
        ts,
        ...turn,
      });
    }
    // Replay the turn's reasoning BEFORE its tool calls — the live VM keeps a
    // single thinking entry positioned where the first thinking block streamed
    // (ahead of the tools), so a reload renders the mission log in the same
    // order a live watcher saw (HOU-717).
    if (m.thinking) {
      out.push({ feed_type: "thinking", data: m.thinking, ts, ...turn });
    }
    (m.tools ?? []).forEach((t, toolIndex) => {
      // Tool rows are many-per-turn, so each carries its per-turn index — the
      // pair (turnId, toolIndex) is what a replayed live push dedupes against.
      const index = m.turnId !== undefined ? { toolIndex } : {};
      out.push({
        feed_type: "tool_call",
        data: { name: t.name, input: t.input ?? {} },
        ts,
        ...turn,
        ...index,
      });
      out.push({
        feed_type: "tool_result",
        data: { content: t.result ?? "", is_error: !!t.isError },
        ts,
        ...turn,
        ...index,
      });
    });
    if (m.content)
      out.push({ feed_type: "assistant_text", data: m.content, ts, ...turn });
    // A persisted file-change summary: replay it AFTER the assistant text so
    // the chat attaches it to this turn's assistant message on reload.
    if (m.fileChanges) {
      out.push({ feed_type: "file_changes", data: m.fileChanges, ts, ...turn });
    }
    // A turn the user interrupted persisted `stopped`: replay the standard
    // "Stopped by user" system line so the transcript reads identically after a
    // reload — the exact copy + position the live stop settle produces
    // (`finishErr`'s system_message, after the turn's text/tools). A stopped
    // turn never carries a `pendingInteraction`, so no card competes with it.
    if (m.stopped) {
      out.push({
        feed_type: "system_message",
        data: STOPPED_BY_USER,
        ts,
        ...turn,
      });
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
        ts,
        ...turn,
      });
    }
  }
  return out;
}
