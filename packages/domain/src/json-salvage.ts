/**
 * Salvage for `.houston` JSON docs that fail `JSON.parse` without the user
 * having lost anything. Two shapes seen in the wild on `routines.json`, both
 * from an outside writer (the host's own writes are `JSON.stringify` + atomic,
 * so they never produce either):
 *
 *  1. A complete value followed by trailing bytes: the full array + a second
 *     partial copy of it (an appended/overlapped write). The Rust engine kept
 *     the first value; the TS cutover dropped it.
 *  2. A raw control character (a literal newline or tab) inside a string
 *     literal: an agent's in-place edit of a long `prompt`. `JSON.parse`
 *     rejects the whole file for one byte.
 *  3. An unescaped `"` inside a string literal: the same in-place edit
 *     pasting a prompt that quotes a word (`contenga "Temu" en el nombre`).
 *     The quote ends the string early and the parser trips on the next
 *     word. Seen together with shape 2 in the same prompt, which is why
 *     the passes chain.
 *
 * Any of them one mangled file 500'd `list_routines` on every poll, bricked
 * the Routines tab for that agent, and stopped its routines from firing. All
 * repairs are lossless: the raw newline becomes the newline it meant, the
 * quote stays the quote it meant, the trailing junk was never user data, and
 * the next save rewrites the file clean. Anything else still surfaces as the
 * caller's "not valid JSON" throw, because a lossy reset would destroy the
 * user's data on next write.
 */

/**
 * Index just past the first complete top-level object/array in `text`, or
 * -1 when the text does not start with one or it never closes. Scalars are
 * not salvaged: a scalar doc is never a `.houston` data file.
 */
export function firstJsonValueEnd(text: string): number {
  let i = 0;
  while (i < text.length && isJsonWhitespace(text[i])) i++;
  const open = text[i];
  if (open !== "{" && open !== "[") return -1;
  let depth = 0;
  let inString = false;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return -1;
}

/**
 * `text` with every raw control character (U+0000..U+001F) that sits INSIDE
 * a string literal replaced by its JSON escape, or `undefined` when there is
 * none. Control characters between tokens are left alone: whitespace there is
 * legal and anything else is a real syntax error, not ours to guess. Escape
 * sequences are skipped as a pair so a `\"` never closes the string early.
 */
export function escapeControlCharsInStrings(text: string): string | undefined {
  let out = "";
  let last = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      continue;
    }
    if (ch === "\\") i++;
    else if (ch === '"') inString = false;
    else if (text.charCodeAt(i) < 0x20) {
      out += text.slice(last, i) + jsonEscape(text.charCodeAt(i));
      last = i + 1;
    }
  }
  if (last === 0) return undefined;
  return out + text.slice(last);
}

/**
 * `text` with every `"` that sits INSIDE a string literal but does not end it
 * escaped, or `undefined` when there is none. A quote ends a string only
 * when the next non-whitespace character is one JSON can accept after a
 * string: `,` `}` `]` `:` or the end of the text. Any other `"` was a literal
 * the writer forgot to escape. A stray quote that happens to sit before a
 * comma still reads as a terminator, and the parse fails as before: this
 * pass guesses nothing that the grammar cannot rule out.
 */
export function escapeStrayQuotesInStrings(text: string): string | undefined {
  let out = "";
  let last = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!inString) {
      if (ch === '"') inString = true;
      continue;
    }
    if (ch === "\\") i++;
    else if (ch === '"') {
      if (closesString(text, i + 1)) inString = false;
      else {
        out += `${text.slice(last, i)}\\"`;
        last = i + 1;
      }
    }
  }
  if (last === 0) return undefined;
  return out + text.slice(last);
}

/** True when the text after a closing quote can legally follow a string. */
function closesString(text: string, from: number): boolean {
  let j = from;
  while (j < text.length && isJsonWhitespace(text[j])) j++;
  const next = text[j];
  return (
    next === undefined ||
    next === "," ||
    next === "}" ||
    next === "]" ||
    next === ":"
  );
}

/**
 * Parse the leading complete value of a doc that has trailing junk after it.
 * Returns `undefined` when there is nothing to salvage (no complete leading
 * value, or the prefix itself is not valid JSON): the caller keeps its throw.
 */
export function salvageLeadingJson(text: string): unknown {
  const end = firstJsonValueEnd(text);
  if (end < 0 || end >= text.length) return undefined;
  if (text.slice(end).trim() === "") return undefined;
  try {
    return JSON.parse(text.slice(0, end)) as unknown;
  } catch {
    // Mangled inside the leading value, not just after it: not ours to guess.
    return undefined;
  }
}

/**
 * Every lossless repair in turn, for a doc `JSON.parse` already rejected:
 * re-escape raw control characters inside strings, then stray quotes inside
 * strings, then keep the leading value when trailing junk follows.
 * `undefined` = nothing recoverable.
 */
export function salvageJsonDoc(text: string): unknown {
  const escaped = escapeControlCharsInStrings(text);
  if (escaped !== undefined) {
    try {
      return JSON.parse(escaped) as unknown;
    } catch {
      // Still broken elsewhere: keep repairing.
    }
  }
  const quoted = escapeStrayQuotesInStrings(escaped ?? text);
  if (quoted !== undefined) {
    try {
      return JSON.parse(quoted) as unknown;
    } catch {
      // Still broken elsewhere: fall through to the trailing-junk repair.
    }
  }
  return salvageLeadingJson(quoted ?? escaped ?? text);
}

/** The JSON escape for one control character: `\n`, `\t`, or `\u00XX`. */
function jsonEscape(code: number): string {
  return JSON.stringify(String.fromCharCode(code)).slice(1, -1);
}

function isJsonWhitespace(ch: string | undefined): boolean {
  return ch === " " || ch === "\n" || ch === "\r" || ch === "\t";
}
