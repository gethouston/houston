/**
 * The primitives every mention module shares (HOU-944): Unicode normalization,
 * the two matching keys, and the "is this `@` a real mention start" boundary
 * rule. They live in their own module so `mention-query.ts` (composer),
 * `mention-send.ts` (send) and `mention-spans.ts` (renderer) can each depend on
 * them without depending on each other. Pure, no React.
 */

/** Characters an `@` may legally follow and still start a mention: an opening
 *  bracket or quote. Anything else (a letter, a digit, `.`) means the `@` is
 *  mid-word — "ada@example.com" is an address, not a mention. */
const OPENING_CHARS = new Set(["(", "[", "{", "<", '"', "'", "“", "‘"]);

/** A character that would EXTEND a name, so a match must not be followed by
 *  one: "@Ada" inside "@Adam" is not a mention of Ada. Combining marks count —
 *  a leftover mark after a matched run belongs to that run's last letter. */
const WORD_CHAR = /[\p{L}\p{N}\p{M}_]/u;

/**
 * THE normalization every mention comparison happens in. Two strings that a
 * reader sees as identical can carry different code points ("é" as one
 * precomposed character, or as "e" plus a combining accent); NFC picks the
 * composed form for both, so a name's `.length` measures the same number of
 * UTF-16 units in the roster and in the message text.
 *
 * This is what makes {@link matchAt}'s slice-by-name-length safe. Apply it to
 * roster names once where the target list is built, and to message text at the
 * entry of span finding — both are idempotent, so applying it twice is free.
 */
export function normalizeMentionText(s: string): string {
  return s.normalize("NFC");
}

/**
 * The SPAN key: NFC plus case folding, nothing else. Deliberately NOT
 * diacritic-insensitive — the span finder slices the text by the target name's
 * length, and folding accents away would let a 4-unit name match a 5-unit run
 * (or the reverse), truncating the chip mid-grapheme and leaking a combining
 * accent into the next text node. "@ada" still chips Ada; "@Jose" does not chip
 * "José", because it is not that person's name.
 */
export function mentionSpanKey(s: string): string {
  return normalizeMentionText(s).toLowerCase();
}

/**
 * The FILTER key: case- AND diacritic-insensitive, so typing "jose" offers
 * "José" in the autocomplete. Only ever used to decide which people the
 * popover shows — never to place a span, where the length change it causes
 * would be a correctness bug (see {@link mentionSpanKey}).
 */
export function mentionKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** True when the `@` at `index` may start a mention: it is at the start of the
 *  text, or follows whitespace or an opening bracket/quote. */
export function isMentionStart(text: string, index: number): boolean {
  if (text[index] !== "@") return false;
  if (index === 0) return true;
  const prev = text[index - 1] as string;
  return /\s/.test(prev) || OPENING_CHARS.has(prev);
}

/** True when `char` would run on from a matched name (so the match is bogus). */
export function extendsName(char: string | undefined): boolean {
  return char !== undefined && WORD_CHAR.test(char);
}
