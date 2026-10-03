/**
 * Markdown code fences, line by line, for the loop detector
 * (runaway-output.ts), which never judges text inside a code block. This
 * follows CommonMark's fences closely enough for model output, not fully: a
 * fence is a line of 3 or more backticks or tildes after any indentation or
 * quote markers (a block nested in a list or a quote counts). It closes on a
 * line of the same character, at least as long, with nothing after it, in the
 * same quote and indented within 3 columns of the opener; or when its quote
 * or list item ends. A backtick run mid-sentence is no fence, nor is a line
 * longer than `FENCE_LINE_MAX` (bar trailing spaces): a looping line never
 * ends, and must still be judged.
 */
const FENCE_LINE = /^([ \t>]*)(`{3,}|~{3,})(.*)$/;
/** A line that may still become a fence line as more of it streams. */
export const FENCE_PREFIX = /^[ \t>]*(?:`*|~*|`{3,}.*|~{3,}.*)$/s;
/** A closer-shaped line: trailing spaces past the cap do not change it. */
export const CLOSER_SHAPE = /^[ \t>]*(?:`{3,}|~{3,})[ \t]*$/;
export const FENCE_LINE_MAX = 512;

interface Container {
  /** Quote markers. */
  quotes: number;
  /** Columns of indentation after the last quote marker, a tab as 4. */
  indent: number;
}

export interface Fence extends Container {
  char: string;
  run: number;
}

/**
 * The quote markers and indentation `line` starts with. Past `maxQuotes`
 * markers a `>` is content (a quotation inside a code block), not a quote.
 */
function containerOf(
  line: string,
  maxQuotes = Number.POSITIVE_INFINITY,
): Container {
  let quotes = 0;
  let indent = 0;
  for (const c of /^[ \t>]*/.exec(line)?.[0] ?? "") {
    if (c === ">") {
      if (quotes === maxQuotes) break;
      quotes++;
      indent = 0;
    } else indent += c === "\t" ? 4 : 1;
  }
  return { quotes, indent };
}

/**
 * Whether a non-blank `line` ends `fence`'s quote or list item: fewer quote
 * markers, or less indentation than any content of the item it opened in.
 */
export function endsContainer(line: string, fence: Fence): boolean {
  if (line.trim() === "") return false;
  const { quotes, indent } = containerOf(line, fence.quotes);
  return quotes < fence.quotes || indent < fence.indent - 3;
}

/** The fence `line` opens, when no fence is open. */
export function opens(line: string): Fence | null {
  const match = FENCE_LINE.exec(line);
  if (!match) return null;
  const [, , run = "", rest = ""] = match;
  const char = run.charAt(0);
  // A backtick opener's info string holds no backtick (that line is inline code).
  if (char === "`" && rest.includes("`")) return null;
  return { char, run: run.length, ...containerOf(line) };
}

export function closes(line: string, fence: Fence): boolean {
  const match = FENCE_LINE.exec(line);
  if (!match) return false;
  const [, , run = "", rest = ""] = match;
  const { quotes, indent } = containerOf(line);
  return (
    run.charAt(0) === fence.char &&
    run.length >= fence.run &&
    rest.trim() === "" &&
    quotes === fence.quotes &&
    Math.abs(indent - fence.indent) <= 3
  );
}
