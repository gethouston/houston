import { isAutoContinue } from "@houston/protocol";
import type { ChatMessage } from "@houston/runtime-client";
import { assistantHistory } from "./history-assistant";
import type { EngineNoticeKind } from "./turn-errors";
import type { FilesNotSavedData } from "./turn-unsaved-notice";
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
  /** The teammates a `user_message` @mentions. The seed/prepend folds
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
  noticeData?: FilesNotSavedData;
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
   * the identity the VM fold dedupes on: a live sink re-delivering
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
  for (const [i, m] of messages.entries()) {
    const ts = m.ts;
    const turn = m.turnId !== undefined ? { turnId: m.turnId } : {};
    if (m.role === "user") {
      if (isAutoContinue(m.content)) continue;
      out.push({
        feed_type: "user_message",
        data: m.displayText ?? m.content,
        author: m.author,
        mentions: m.mentions,
        ts,
        ...turn,
      });
      continue;
    }
    out.push(...assistantHistory(m, mapProvider, messages[i + 1]));
  }
  return out;
}
