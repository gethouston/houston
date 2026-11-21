import { isTooling, RUST_SAFETY } from "./classify.ts";
import { lexCss } from "./lex-css.ts";
import { lexRust } from "./lex-rust.ts";
import { lexShell, shellTokens } from "./lex-shell.ts";
import type { Comment, Lang, Pinned, RawComment, Token } from "./model.ts";
import { tsComments } from "./scan-ts.ts";
import { lineStarts, positionOf } from "./text.ts";
import { tsTokens } from "./tokens-ts.ts";

export function langOf(file: string): Lang | null {
  if (file.endsWith(".d.ts") || /\.generated\./.test(file)) return null;
  if (/\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(file)) return "ts";
  if (file.endsWith(".rs")) return "rust";
  if (file.endsWith(".css")) return "css";
  if (file.endsWith(".sh")) return "shell";
  return null;
}

export function requireLang(file: string): Lang {
  const lang = langOf(file);
  if (!lang) throw new Error(`${file} is not a file the comment tools read`);
  return lang;
}

function rawComments(lang: Lang, file: string, text: string): RawComment[] {
  if (lang === "ts") return tsComments(file, text);
  if (lang === "rust") return lexRust(file, text).comments;
  if (lang === "css") return lexCss(file, text).comments;
  return lexShell(file, text).comments;
}

export function tokensOf(file: string, text: string): Token[] {
  const lang = requireLang(file);
  if (lang === "ts") return tsTokens(file, text);
  if (lang === "rust") return lexRust(file, text).tokens;
  if (lang === "css") return lexCss(file, text).tokens;
  return shellTokens(text, lexShell(file, text));
}

function ownLine(text: string, starts: readonly number[], at: number): boolean {
  const { line } = positionOf(starts, at);
  return /^[ \t]*$/.test(text.slice(starts[line - 1], at));
}

function sameClass(lang: Lang, previous: Comment, next: Comment): boolean {
  if (next.tooling === previous.tooling) return true;
  return lang === "rust" && !next.tooling && RUST_SAFETY.test(previous.text);
}

function joins(
  lang: Lang,
  previous: Comment,
  next: Comment,
  text: string,
): boolean {
  return (
    previous.kind === "line" &&
    next.kind === "line" &&
    next.line === previous.endLine + 1 &&
    next.col === previous.col &&
    sameClass(lang, previous, next) &&
    /^[ \t]*\r?\n[ \t]*$/.test(text.slice(previous.end, next.start))
  );
}

export function scanSource(
  file: string,
  text: string,
  pinned: readonly Pinned[],
): Comment[] {
  const lang = requireLang(file);
  const starts = lineStarts(text);
  const out: Comment[] = [];
  for (const raw of rawComments(lang, file, text)) {
    const { line, col } = positionOf(starts, raw.start);
    const body = text.slice(raw.start, raw.end);
    const comment: Comment = {
      ...raw,
      id: `${file}:${line}:${col}`,
      file,
      line,
      col,
      endLine: positionOf(starts, Math.max(raw.start, raw.end - 1)).line,
      text: body,
      tooling: isTooling(lang, file, body, raw.kind, pinned),
    };
    const previous = out.at(-1);
    if (
      previous &&
      ownLine(text, starts, raw.start) &&
      ownLine(text, starts, previous.start) &&
      joins(lang, previous, comment, text)
    ) {
      previous.end = comment.end;
      previous.endLine = comment.endLine;
      previous.text = text.slice(previous.start, previous.end);
    } else out.push(comment);
  }
  return out;
}
