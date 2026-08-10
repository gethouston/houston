/**
 * How the document card holds the page. `"fill"` PINS it: the card takes the
 * height its parents grant (a pinned page column ending at a fixed bottom
 * gap) and longer documents scroll inside it. `{ rows }` is a compact card
 * among other cards: a floor of that many text lines, growing with the text.
 * A union, so no surface can fall into a mode it never chose.
 */
export type ContextEditorLayout = "fill" | { rows: number };

export function isDirty(current: string, baseline: string): boolean {
  return current !== baseline;
}

export function shouldReseed({
  focused,
  dirty,
}: {
  focused: boolean;
  dirty: boolean;
}): boolean {
  return !focused && !dirty;
}

/**
 * Markdown the WYSIWYG schema cannot represent. StarterKit carries no table,
 * image, task-list, footnote or raw-HTML node, and tiptap-markdown DROPS what
 * the schema can't hold — a table round-trips as its mashed cell text. These
 * files are also written BY AGENTS, so such constructs are normal, and one
 * keystroke in a rich editor would corrupt them on save. A document matching
 * any of these opens in the plain-text fallback instead: no rendering, no
 * loss. False positives (a stray `|` in prose) merely fall back to plain
 * editing — the safe direction. Known limit: the guard screens the SEED, not
 * pastes — markdown pasted into an open rich doc lands as visible literal
 * text (degraded, never invisibly lost).
 */
const WYSIWYG_UNSAFE = [
  /^\s{0,3}\|.*\|/m, // table row (piped)
  /^\s{0,3}\|?[\s:]*-{3,}[\s:|-]*\|[\s:|-]*$/m, // table delimiter row
  /^.*\|.*\n\s{0,3}\|?[\s:]*:?-{3,}/m, // headerless pipe table (Name | Value)
  /<[a-zA-Z][^>\n]*>/, // raw HTML tag
  /^\s*[-*+]\s+\[[ xX]\]/m, // task list item
  /!\[/, // image
  /^\s{0,3}\[[^\]]+\]:\s/m, // reference-style link definition
];

/** Whether the document can round-trip through the rich editor losslessly. */
export function isWysiwygSafe(markdown: string): boolean {
  // A `---` fence at the very start is frontmatter (mid-document it is a
  // horizontal rule, which the schema supports).
  if (markdown.startsWith("---")) return false;
  return !WYSIWYG_UNSAFE.some((pattern) => pattern.test(markdown));
}

/**
 * The compact card's minimum height: `rows` real text lines (16px body at
 * `leading-relaxed` = 1.625rem per line) plus the document's own `py-4`
 * vertical padding, which `border-box` would otherwise eat out of the floor.
 */
export function compactMinHeight(rows: number): string {
  return `calc(${rows * 1.625}rem + 2rem)`;
}
