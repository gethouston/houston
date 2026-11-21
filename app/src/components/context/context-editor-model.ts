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

const WYSIWYG_UNSAFE = [
  /^\s{0,3}\|.*\|/m,
  /^\s{0,3}\|?[\s:]*-{3,}[\s:|-]*\|[\s:|-]*$/m,
  /^.*\|.*\n\s{0,3}\|?[\s:]*:?-{3,}/m,
  /<[a-zA-Z][^>\n]*>/,
  /^\s*[-*+]\s+\[[ xX]\]/m,
  /!\[/,
  /^\s{0,3}\[[^\]]+\]:\s/m,
];

export function isWysiwygSafe(markdown: string): boolean {
  if (markdown.startsWith("---")) return false;
  return !WYSIWYG_UNSAFE.some((pattern) => pattern.test(markdown));
}

export function compactMinHeight(rows: number): string {
  return `calc(${rows * 1.625}rem + 2rem)`;
}
