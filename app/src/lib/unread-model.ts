import { isSetupChatMode } from "./integration-chat-setup.ts";
import {
  isRelevantToMe,
  latestMentionAtFor,
  type RelevanceConversation,
} from "./mission-relevance.ts";
import {
  cursorKey,
  mentionReadFloorFor,
  type ReadCursorStore,
  readFloorFor,
} from "./read-cursors.ts";

/**
 * Pure, DOM-free unread model (HOU-945): which missions have moved since I last
 * looked at them, and how many per agent — the numbers the sidebar paints.
 *
 * Unread is defined against MY read floor ({@link readFloorFor}), never against
 * a server flag, so it stays correct with no write on every mission open and
 * degrades to the store's `since` for anything I have never opened.
 *
 * Relevance comes first, deliberately: in a team, a teammate's mission moving
 * is not news for me, and a sidebar that counts it teaches the user to ignore
 * the badge. A mission that @mentions me counts even though I never touched it
 * — the @mention IS the claim on my attention.
 */

export interface UnreadConversationInput extends RelevanceConversation {
  id: string;
  agent_path: string;
  type: "primary" | "activity";
  /** Agent-mode id; guided setup chats never count. */
  agent?: string | null;
  /** ISO 8601 instant of the mission's last movement. */
  updated_at?: string;
}

/**
 * Is this conversation unread FOR ME? Only relevant missions can be unread
 * (relevance is the whole point). No `selfId` or a setup chat is never unread.
 *
 * "No `selfId` is never unread" is the mirror image of relevance failing open:
 * with nobody signed in there is no per-person read state to compare against,
 * so an unread badge would be a number nobody could ever clear. Notifications
 * fail open because a missed ping is unrecoverable; a badge is not.
 *
 * TWO clocks, because the two signals are not the same claim:
 *
 * - An outstanding @MENTION of me wins outright, measured against my cursor for
 *   this conversation ALONE ({@link mentionReadFloorFor} — no `since` fallback).
 *   Someone typed my name; until I open the mission that is unread however old
 *   it is and whether or not I have ever touched it. Judging a mention by
 *   `updated_at` would also lose it the moment the mission moved on without me.
 * - Otherwise ambient movement: `updated_at` strictly after my read floor, which
 *   DOES fall back to `since` so a fresh device does not open on a backlog.
 *
 * Strictly-after (not at-or-after) so marking a mission read at the instant of
 * its own `updated_at` clears it, instead of leaving it stuck unread.
 */
export function isUnreadForMe(
  conv: UnreadConversationInput,
  store: ReadCursorStore,
  selfId: string | null,
): boolean {
  if (selfId === null) return false;
  if (isSetupChatMode(conv.agent)) return false;
  if (!isRelevantToMe(conv, selfId)) return false;

  const key = cursorKey(conv.agent_path, conv.id);
  const mentionedAt = latestMentionAtFor(conv, selfId);
  if (mentionedAt !== null && mentionedAt > mentionReadFloorFor(store, key))
    return true;

  if (!conv.updated_at) return false;
  const updatedAt = Date.parse(conv.updated_at);
  if (Number.isNaN(updatedAt)) return false;
  return updatedAt > readFloorFor(store, key);
}

/**
 * Unread counts per `agent_path`. Setup chats and non-`activity` rows never
 * count — the same exclusions the sidebar's needs-you badge already applies
 * ({@link buildAgentActivitySummaries}), so the two badges can never disagree
 * about what a mission is. Agents with nothing unread get no entry, so the
 * caller reads a missing key as zero.
 */
export function countUnreadByAgentPath(
  convs: readonly UnreadConversationInput[],
  store: ReadCursorStore,
  selfId: string | null,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const conv of convs) {
    if (conv.type !== "activity") continue;
    if (!isUnreadForMe(conv, store, selfId)) continue;
    counts[conv.agent_path] = (counts[conv.agent_path] ?? 0) + 1;
  }
  return counts;
}
