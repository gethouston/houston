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

import { isAutoContinue } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import { assistantHistory } from "./history-assistant";
import type { EngineNoticeKind } from "./turn-errors";
import type { FeedAuthor, FeedMention } from "./vm-output";

/**
 * One replayed feed frame: the SAME `{ feed_type, data }` push the turn
 * machinery emits, plus the optional multiplayer `author` on a user message
 * (carried so a shared conversation attributes each teammate's bubble on
 * reload). Plain JSON — it crosses the `dispatch` boundary unchanged.
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
   * Why the engine authored a `system_message`, when it did (a restart, a
   * resume). `data` stays the English default; a surface renders its own copy
   * by kind. Optional/additive; plain JSON across the `dispatch` boundary.
   */
  notice?: EngineNoticeKind;
  /**
   * Epoch-ms timestamp of the source `ChatMessage` this frame was folded from
   * (`ChatMessage.ts`). Carried on every frame attributable to a message so a
   * client can render a relative time on reload. Optional/additive: absent for
   * pre-`ts` transcripts and for frames not tied to a message. Plain JSON — it
   * crosses the `dispatch` boundary unchanged.
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
      // A hidden auto-continue prompt is a message the USER never wrote — the
      // engine minted it (a boot resume, a continue directive). It is model
      // input only, so it never becomes a bubble on any surface. Folded away
      // HERE, in the shared behaviour layer, because every SDK binder would
      // otherwise render the raw marker text.
      if (isAutoContinue(m.content)) continue;
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
    out.push(...assistantHistory(m, mapProvider));
  }
  return out;
}
