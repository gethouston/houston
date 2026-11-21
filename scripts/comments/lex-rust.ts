import type { RawComment, Token } from "./model.ts";

export interface Lexed {
  comments: RawComment[];
  tokens: Token[];
}

const IDENT = /[A-Za-z0-9_]/;

function fail(file: string, at: number, what: string): never {
  throw new Error(`${file}: unterminated ${what} at offset ${at}`);
}

function blockEnd(file: string, text: string, at: number): number {
  let depth = 1;
  let i = at + 2;
  while (depth > 0) {
    if (i >= text.length) fail(file, at, "block comment");
    if (text.startsWith("/*", i)) {
      depth++;
      i += 2;
    } else if (text.startsWith("*/", i)) {
      depth--;
      i += 2;
    } else i++;
  }
  return i;
}

function quotedEnd(file: string, text: string, at: number): number {
  let i = at + 1;
  while (text[i] !== '"') {
    if (i >= text.length) fail(file, at, "string");
    i += text[i] === "\\" ? 2 : 1;
  }
  return i + 1;
}

function rawEnd(file: string, text: string, at: number): number | null {
  let i = at;
  while (text[i] === "#") i++;
  if (text[i] !== '"') return null;
  const close = `"${"#".repeat(i - at)}`;
  const end = text.indexOf(close, i + 1);
  if (end < 0) fail(file, at, "raw string");
  return end + close.length;
}

function quoteEnd(file: string, text: string, at: number): number {
  if (text[at + 1] === "\\") {
    const close = text.indexOf("'", at + 3);
    if (close < 0) fail(file, at, "char literal");
    return close + 1;
  }
  const point = text.codePointAt(at + 1) ?? 0;
  const width = point > 0xffff ? 2 : 1;
  if (text[at + 1 + width] === "'") return at + 2 + width;
  let i = at + 1;
  while (i < text.length && IDENT.test(text[i])) i++;
  return i;
}

function literalEnd(file: string, text: string, at: number): number | null {
  const c = text[at];
  const prefixed = c === "b" || c === "c";
  if (c === "r" || (prefixed && text[at + 1] === "r")) {
    const end = rawEnd(file, text, at + (c === "r" ? 1 : 2));
    if (end !== null) return end;
  }
  if (prefixed && text[at + 1] === '"') return quotedEnd(file, text, at + 1);
  if (c === "b" && text[at + 1] === "'") return quoteEnd(file, text, at + 1);
  if (c === '"') return quotedEnd(file, text, at);
  if (c === "'") return quoteEnd(file, text, at);
  return null;
}

export function lexRust(file: string, text: string): Lexed {
  const comments: RawComment[] = [];
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (text.startsWith("//", i)) {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? text.length : end;
      comments.push({ start: i, end: stop, kind: "line" });
      i = stop;
      continue;
    }
    if (text.startsWith("/*", i)) {
      const end = blockEnd(file, text, i);
      comments.push({ start: i, end, kind: "block" });
      i = end;
      continue;
    }
    let end = literalEnd(file, text, i);
    if (end === null && IDENT.test(c)) {
      end = i + 1;
      while (end < text.length && IDENT.test(text[end])) end++;
    }
    end ??= i + 1;
    tokens.push({ text: text.slice(i, end), pos: i });
    i = end;
  }
  return { comments, tokens };
}
