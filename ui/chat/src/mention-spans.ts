import {
  extendsName,
  isMentionStart,
  mentionSpanKey,
  normalizeMentionText,
} from "./mention-text.ts";

export interface MentionTarget {
  name: string;
  userId?: string;
  isSelf?: boolean;
}

export interface MentionSpan {
  start: number;
  end: number;
  target: MentionTarget;
}

export function findMentionSpans(
  text: string,
  targets: readonly MentionTarget[],
): MentionSpan[] {
  const ranked = rankTargets(targets);
  if (ranked.length === 0) return [];
  const source = normalizeMentionText(text);

  const spans: MentionSpan[] = [];
  for (let i = 0; i < source.length; i += 1) {
    if (!isMentionStart(source, i)) continue;
    const match = matchAt(source, i, ranked);
    if (!match) continue;
    spans.push(match);
    i = match.end - 1;
  }
  return spans;
}

function rankTargets(targets: readonly MentionTarget[]): MentionTarget[] {
  const byName = new Map<string, MentionTarget>();
  for (const target of targets) {
    const name = normalizeMentionText(target.name);
    if (name.length === 0) continue;
    const key = mentionSpanKey(name);
    const existing = byName.get(key);
    if (existing) {
      if (target.isSelf) existing.isSelf = true;
      continue;
    }
    byName.set(key, { ...target, name });
  }
  return [...byName.values()].sort((a, b) => b.name.length - a.name.length);
}

export function sameMentionTargets(
  a: readonly MentionTarget[] | undefined,
  b: readonly MentionTarget[] | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((target, index) => {
    const other = b[index] as MentionTarget;
    return (
      target.name === other.name &&
      target.userId === other.userId &&
      target.isSelf === other.isSelf
    );
  });
}

function matchAt(
  text: string,
  at: number,
  ranked: readonly MentionTarget[],
): MentionSpan | null {
  for (const target of ranked) {
    const end = at + 1 + target.name.length;
    if (end > text.length) continue;
    if (
      mentionSpanKey(text.slice(at + 1, end)) !== mentionSpanKey(target.name)
    ) {
      continue;
    }
    if (extendsName(text[end])) continue;
    return { start: at, end, target };
  }
  return null;
}
