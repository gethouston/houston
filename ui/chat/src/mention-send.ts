/**
 * Which pending @mentions a SEND actually carries (HOU-944).
 *
 * The composer records `{userId, name}` on the side when a person is accepted;
 * the text stays plain. At send time only the picks whose "@Name" run still
 * survives in the message ship, so deleting the words deletes the mention —
 * and only where the RENDERER would chip them, so nobody is notified about a
 * message that addresses them nowhere (see `mention-mask.ts`). Pure, no React.
 */

import { maskMarkdown } from "./mention-mask.ts";
import { findMentionSpans } from "./mention-spans.ts";
import { mentionSpanKey, normalizeMentionText } from "./mention-text.ts";
import type { MessageMention } from "./types";

/** A pending pick that can actually be matched: it knows the name it wrote. */
type NamedMention = MessageMention & { name: string };

/**
 * The mentions `text` still contains, in pick order, deduped by userId.
 *
 * Two co-members can share a display name, and "@Ana" cannot say which Ana it
 * means. Occurrences are therefore handed out IN ORDER to the picks made under
 * that name: the first "@Ana" is the first Ana the user chose, the second is
 * the second. Every occurrence past the number of people picked repeats the
 * first — one Ana picked and written twice is still one mention of her.
 */
export function resolveMentions(
  text: string,
  pending: readonly MessageMention[],
): MessageMention[] {
  const named = pending.filter(
    (mention): mention is NamedMention =>
      typeof mention.name === "string" && mention.name.length > 0,
  );
  if (named.length === 0) return [];

  const spans = findMentionSpans(
    maskMarkdown(normalizeMentionText(text)),
    named.map((mention) => ({ name: mention.name })),
  );
  if (spans.length === 0) return [];

  const claimed = claimOccurrences(
    spans.map((span) => span.target.name),
    named,
  );
  const seen = new Set<string>();
  const resolved: MessageMention[] = [];
  for (const mention of named) {
    if (!claimed.has(mention.userId) || seen.has(mention.userId)) continue;
    seen.add(mention.userId);
    resolved.push(mention);
  }
  return resolved;
}

/** The userIds the occurrences of each name resolve to. */
function claimOccurrences(
  occurrences: readonly string[],
  named: readonly NamedMention[],
): Set<string> {
  const queues = new Map<string, NamedMention[]>();
  for (const mention of named) {
    const key = mentionSpanKey(mention.name);
    const queue = queues.get(key);
    if (queue) queue.push(mention);
    else queues.set(key, [mention]);
  }

  const used = new Map<string, number>();
  const claimed = new Set<string>();
  for (const name of occurrences) {
    const key = mentionSpanKey(name);
    const queue = queues.get(key);
    if (!queue) continue;
    const index = used.get(key) ?? 0;
    used.set(key, index + 1);
    claimed.add(
      (queue[Math.min(index, queue.length - 1)] as NamedMention).userId,
    );
  }
  return claimed;
}
