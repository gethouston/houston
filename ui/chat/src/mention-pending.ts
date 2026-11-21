import type { MessageMention } from "./types";

export const MENTION_DRAFT_LIMIT = 12;

export type PendingMentions = Map<string, MessageMention[]>;

export function readPending(
  drafts: PendingMentions,
  key: string,
): readonly MessageMention[] {
  return drafts.get(key) ?? EMPTY;
}

const EMPTY: readonly MessageMention[] = [];

export function recordPending(
  drafts: PendingMentions,
  key: string,
  mention: MessageMention,
): void {
  const current = drafts.get(key) ?? [];
  const known = current.some((m) => m.userId === mention.userId);
  drafts.delete(key);
  drafts.set(key, known ? current : [...current, mention]);
  while (drafts.size > MENTION_DRAFT_LIMIT) {
    const oldest = drafts.keys().next().value;
    if (oldest === undefined) return;
    drafts.delete(oldest);
  }
}

export function dropPending(drafts: PendingMentions, key: string): void {
  drafts.delete(key);
}
