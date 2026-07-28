/**
 * The composer's pending @mention picks, scoped per draft (HOU-944).
 *
 * Accepting a person writes PLAIN TEXT into the textarea and records
 * `{userId, name}` here on the side. Draft text is already kept per
 * conversation by the app, so the sidecar has to be too: a panel-global list
 * would send one conversation's picks with another's text after a switch, or
 * lose them entirely when the user comes back to finish a parked message.
 *
 * Pure map operations, no React, so the eviction and the per-draft isolation
 * are unit-testable.
 */

import type { MessageMention } from "./types";

/** Drafts kept at once. Past this the least recently touched is dropped: a
 *  user who parked a mention in a conversation they have not opened in a dozen
 *  switches will have to re-pick, which beats an unbounded map. */
export const MENTION_DRAFT_LIMIT = 12;

/** Picks by draft key, least recently touched first. */
export type PendingMentions = Map<string, MessageMention[]>;

/** The picks parked under `key`, oldest first. Never undefined. */
export function readPending(
  drafts: PendingMentions,
  key: string,
): readonly MessageMention[] {
  return drafts.get(key) ?? EMPTY;
}

const EMPTY: readonly MessageMention[] = [];

/** Record a pick under `key`, ignoring a person already parked there. */
export function recordPending(
  drafts: PendingMentions,
  key: string,
  mention: MessageMention,
): void {
  const current = drafts.get(key) ?? [];
  const known = current.some((m) => m.userId === mention.userId);
  // Re-insert either way: a Map keeps insertion order, which is what makes the
  // first key the least recently touched one.
  drafts.delete(key);
  drafts.set(key, known ? current : [...current, mention]);
  while (drafts.size > MENTION_DRAFT_LIMIT) {
    const oldest = drafts.keys().next().value;
    if (oldest === undefined) return;
    drafts.delete(oldest);
  }
}

/** Forget `key`'s picks — the draft was sent. */
export function dropPending(drafts: PendingMentions, key: string): void {
  drafts.delete(key);
}
