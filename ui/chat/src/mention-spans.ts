/**
 * Render-side mention matching (HOU-944): where in a message's text an
 * "@Name" occurrence sits, so the markdown renderer can swap those runs for
 * chips. Pure, no React, no i18n — the library boundary keeps it props-only.
 */

import {
  extendsName,
  isMentionStart,
  mentionSpanKey,
  normalizeMentionText,
} from "./mention-text.ts";

/** A person the renderer knows how to chip. `userId` is present for a user
 *  message's own recorded mentions and absent when the match came from a
 *  props-supplied roster; `isSelf` emphasizes a mention of the viewer. */
export interface MentionTarget {
  name: string;
  userId?: string;
  isSelf?: boolean;
}

/** A matched "@Name" run: `[start, end)` offsets into the source text, `start`
 *  pointing at the `@`. */
export interface MentionSpan {
  start: number;
  end: number;
  target: MentionTarget;
}

/**
 * Ordered, non-overlapping "@Name" spans in `text`. Longest name first (so
 * "@Ada Lovelace" wins over "@Ada"), case-insensitive, the `@` must start the
 * string or follow whitespace/an opening bracket, and the match may not run
 * into a longer word ("@Adam" is not a mention of Ada). Pure.
 *
 * OFFSETS INDEX INTO `normalizeMentionText(text)`, not into `text`. Both the
 * text and the target names are normalized to NFC here so a name's UTF-16
 * length measures the same run on both sides; a caller that SLICES the result
 * must normalize its own copy first (it is idempotent, so doing so costs
 * nothing when the string is already NFC).
 */
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
    // Resume after the match so spans never overlap (the loop's own `i += 1`
    // lands on the first character past it).
    i = match.end - 1;
  }
  return spans;
}

/**
 * The targets the matcher runs on: NFC names, longest first (ties keep roster
 * order — a stable sort), and ONE target per name.
 *
 * Two co-members can share a display name. The text "@Ana" cannot say which
 * Ana it means, so they collapse into a single target that carries the first
 * one's identity and the OR of their `isSelf` flags: "one of the people this
 * names is me" is exactly what the viewer emphasis is for, and dropping it
 * because the OTHER Ana sorted first would silently un-address the reader.
 * Which userId a SEND attributes to each occurrence is decided separately,
 * from the pending picks (`mention-send.ts`).
 */
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

/**
 * Value equality for two target lists. `MessageResponse` is memoized with a
 * hand-written comparator, and the target list is rebuilt on every render of
 * the row above it, so comparing by identity there would re-render (and
 * re-parse) every message on every keystroke.
 */
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
