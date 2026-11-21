import { maskMarkdown } from "./mention-mask.ts";
import { findMentionSpans } from "./mention-spans.ts";
import { mentionSpanKey, normalizeMentionText } from "./mention-text.ts";
import type { MessageMention } from "./types";

type NamedMention = MessageMention & { name: string };

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
