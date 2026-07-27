import type { UserProfile } from "../hooks/queries/use-user-profiles.ts";
import { missionMatchesScope } from "./agent-person-scope.ts";
import {
  buildMissionPeople,
  type MissionAttribution,
} from "./mission-people.ts";

/**
 * Pure, DOM-free model of the ONE question every relevance-scoped surface asks:
 * does this mission concern ME? (HOU-945.) No React, no store, no Supabase — so
 * the rule is unit-tested once and shared verbatim by the completion
 * notification, the unread badges, and the Mentions inbox, which must never
 * drift apart.
 *
 * Two load-bearing fail-OPEN clauses. Neither may be dropped:
 *
 * 1. **No signed-in user (`selfId === null`) means everything is relevant.**
 *    Desktop and single player have no attribution at all; the whole feature has
 *    to be a no-op there, so behaviour stays byte-identical to today.
 * 2. **An unknown mission (`undefined`) is relevant.** Callers resolve a mission
 *    from a cache that can legitimately be a beat behind the event that woke
 *    them. Guessing "not mine" on a cache miss would swallow a real ping — the
 *    one failure mode a notification can never have — so a miss notifies.
 *
 * The "is it mine" half deliberately delegates to {@link missionMatchesScope}
 * with the `me` scope rather than re-deriving the rule, which is what carries
 * its own third fail-open clause into this module: a mission with NO attribution
 * whatsoever counts as mine. Legacy and pre-Teams missions carry no
 * `created_by`/`contributors`, and treating them as somebody else's would go
 * silent on a long-tenured user's entire history on day one of this change.
 */

/** One entry of a mission's @mention aggregate (HOU-945). */
export interface MissionMention {
  user_id: string;
  /** ISO 8601 instant of the newest mention of this person on this mission. */
  at: string;
  /** Who wrote the mention (user id), when the gateway stamped it. */
  by?: string;
}

/** The subset of a conversation row every relevance decision reads. */
export interface RelevanceConversation extends MissionAttribution {
  mentioned?: MissionMention[];
}

/**
 * Membership is decided on ids alone, so the face-stack builder is fed an empty
 * profile map: resolving display names would drag a React Query hook into a
 * module that must stay importable under plain node.
 */
const NO_PROFILES: ReadonlyMap<string, UserProfile> = new Map();

/**
 * Is this mission MINE? Delegates to the `me` person scope over the mission's
 * face stack, so the "created by me OR I contributed OR nobody is stamped at
 * all" rule lives in exactly one place ({@link missionMatchesScope}).
 */
export function missionIsMine(
  conv: RelevanceConversation,
  selfId: string,
): boolean {
  return missionMatchesScope(
    buildMissionPeople(conv, NO_PROFILES),
    { kind: "me" },
    selfId,
  );
}

/**
 * Does ONE aggregate entry count as a ping for `selfId`? It has to name me AND
 * have been written by somebody else. Typing your own name in a mission is not
 * news: it would otherwise earn a permanent Mentions-inbox row and a
 * mention-unread badge that no amount of reading can clear, because the mention
 * clause of {@link isUnreadForMe} deliberately has no `since` floor. The OS ping
 * already refuses to fire on a self-authored mention
 * (`hooks/use-mention-notifications.ts`), so applying the same rule at the
 * source is what keeps the three surfaces telling one story instead of leaving a
 * badge behind for a notification that was never sent.
 *
 * `by` is OPTIONAL, and an entry that carries none STILL COUNTS. The gateway
 * only began stamping mention authors with this feature, so an unstamped entry
 * is a real mention from before the stamp; reading "no author" as "me" would
 * silently swallow a whole generation of them. `mention.by !== selfId` — rather
 * than a `by` presence check — is therefore the load-bearing shape here, not an
 * accident of how the comparison happens to be written.
 */
function isPingForMe(mention: MissionMention, selfId: string): boolean {
  return mention.user_id === selfId && mention.by !== selfId;
}

/** Does the mention aggregate name me, written by somebody else? See
 *  {@link isPingForMe} for why a self-authored entry never counts and why an
 *  entry with no stamped author still does. */
export function missionMentionsMe(
  conv: RelevanceConversation,
  selfId: string,
): boolean {
  return (conv.mentioned ?? []).some((m) => isPingForMe(m, selfId));
}

/**
 * The newest mention of `selfId` on this mission, with its epoch ms — the one
 * derivation of "when was I last pinged here", so the inbox row and the
 * notification watermark can never disagree about which entry is newest.
 *
 * Self-authored entries are skipped ({@link isPingForMe}), which is what stops
 * my own typing from filling my own inbox.
 *
 * An entry whose `at` does not parse is IGNORED rather than treated as now or
 * as epoch zero: a malformed timestamp from the wire must not fabricate a fresh
 * ping, and must not hide a well-formed sibling entry either.
 */
export function latestMentionFor(
  conv: RelevanceConversation,
  selfId: string,
): { mention: MissionMention; at: number } | null {
  let best: { mention: MissionMention; at: number } | null = null;
  for (const mention of conv.mentioned ?? []) {
    if (!isPingForMe(mention, selfId)) continue;
    const at = Date.parse(mention.at);
    if (Number.isNaN(at)) continue;
    if (!best || at > best.at) best = { mention, at };
  }
  return best;
}

/** Epoch ms of the newest mention of `selfId`, or null. */
export function latestMentionAtFor(
  conv: RelevanceConversation,
  selfId: string,
): number | null {
  return latestMentionFor(conv, selfId)?.at ?? null;
}

/**
 * The one relevance rule the whole feature reads: a mission signals ME when it
 * is mine, or when it @mentions me. `selfId === null` (signed out / single
 * player) always true, so desktop behaviour is byte-identical to today. An
 * unknown mission (`undefined`) also true: we fail OPEN, never swallowing a
 * real ping. See the module doc for why both clauses are load-bearing.
 */
export function isRelevantToMe(
  conv: RelevanceConversation | undefined,
  selfId: string | null,
): boolean {
  if (selfId === null || !conv) return true;
  return missionIsMine(conv, selfId) || missionMentionsMe(conv, selfId);
}
