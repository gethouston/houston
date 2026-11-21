import type { Lang, RawComment } from "./model.ts";
import { isBlank, lineEndOf, lineStartOf } from "./text.ts";

function opens(line: string): boolean {
  return /[{([]\s*$/.test(line);
}

function closes(line: string): boolean {
  return /^\s*[})\]]/.test(line);
}

function tidy(text: string, junction: number): string {
  let t = text;
  let p = junction;
  for (;;) {
    const nextEnd = lineEndOf(t, p);
    const next = p < t.length ? t.slice(p, nextEnd) : null;
    const prevStart = p > 0 ? lineStartOf(t, p - 1) : -1;
    const prev = prevStart >= 0 ? t.slice(prevStart, p - 1) : null;
    if (
      next !== null &&
      isBlank(next) &&
      (prev === null || isBlank(prev) || opens(prev))
    ) {
      t = t.slice(0, p) + t.slice(Math.min(nextEnd + 1, t.length));
      continue;
    }
    const outerStart = prevStart > 0 ? lineStartOf(t, prevStart - 1) : -1;
    const outer = outerStart >= 0 ? t.slice(outerStart, prevStart - 1) : null;
    const afterOpen = outer === null || opens(outer);
    if (
      prev !== null &&
      isBlank(prev) &&
      (next === null || closes(next) || afterOpen)
    ) {
      t = t.slice(0, prevStart) + t.slice(p);
      p = prevStart;
      continue;
    }
    return t;
  }
}

function deleteOne(text: string, target: RawComment, lang: Lang): string {
  const { start, end } = target;
  const lineStart = lineStartOf(text, start);
  const lineEnd = lineEndOf(text, end);
  const before = text.slice(lineStart, start);
  const after = text.slice(end, lineEnd);
  const blankBefore = /^[ \t]*$/.test(before);
  const blankAfter = /^[ \t\r]*$/.test(after);
  if (blankBefore && blankAfter) {
    const to = lineEnd >= text.length ? text.length : lineEnd + 1;
    return tidy(text.slice(0, lineStart) + text.slice(to), lineStart);
  }
  if (target.kind === "jsx") return text.slice(0, start) + text.slice(end);
  if (blankAfter) {
    let from = start;
    while (from > lineStart && /[ \t]/.test(text[from - 1])) from--;
    const keep = after.endsWith("\r") ? "\r" : "";
    return text.slice(0, from) + keep + text.slice(lineEnd);
  }
  let to = end;
  while (/[ \t]/.test(text[to] ?? "")) to++;
  const touch = lang === "css" ? /\S/ : /[\w$]/;
  const pad = touch.test(text[start - 1] ?? "") && touch.test(text[to] ?? "");
  return text.slice(0, start) + (pad ? " " : "") + text.slice(to);
}

export function deleteComments(
  text: string,
  targets: readonly RawComment[],
  lang: Lang,
): string {
  const ordered = [...targets].sort((a, b) => b.start - a.start);
  return ordered.reduce(
    (current, target) => deleteOne(current, target, lang),
    text,
  );
}
