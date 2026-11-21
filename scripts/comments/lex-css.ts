import type { Lexed } from "./lex-rust.ts";
import type { RawComment, Token } from "./model.ts";

const WORD = /[A-Za-z0-9_\-.#%@!$]/;
const SPACED = /[:[*+>~]/;

function stringEnd(file: string, text: string, at: number): number {
  const quote = text[at];
  let i = at + 1;
  while (i < text.length && text[i] !== quote && text[i] !== "\n")
    i += text[i] === "\\" ? 2 : 1;
  if (text[i] !== quote)
    throw new Error(`${file}: unterminated string at offset ${at}`);
  return i + 1;
}

function urlEnd(file: string, text: string, open: number): number | null {
  let i = open + 1;
  while (/\s/.test(text[i] ?? "")) i++;
  if (text[i] === '"' || text[i] === "'") return null;
  while (i < text.length && text[i] !== ")") i += text[i] === "\\" ? 2 : 1;
  if (i >= text.length)
    throw new Error(`${file}: unterminated url( at offset ${open}`);
  return i + 1;
}

export function lexCss(file: string, text: string): Lexed {
  const comments: RawComment[] = [];
  const tokens: Token[] = [];
  let gap = false;
  let i = 0;
  const push = (end: number, word: boolean): void => {
    const last = tokens.at(-1);
    const joinsWords = word && WORD.test(last?.text.at(-1) ?? "");
    if (gap && last && (joinsWords || SPACED.test(text[i])))
      tokens.push({ text: " ", pos: i });
    tokens.push({ text: text.slice(i, end), pos: i });
    gap = false;
    i = end;
  };
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) {
      gap = true;
      i++;
    } else if (text.startsWith("/*", i)) {
      const close = text.indexOf("*/", i + 2);
      if (close < 0)
        throw new Error(`${file}: unterminated comment at offset ${i}`);
      comments.push({ start: i, end: close + 2, kind: "block" });
      gap = true;
      i = close + 2;
    } else if (c === '"' || c === "'") push(stringEnd(file, text, i), true);
    else if (WORD.test(c)) {
      let end = i + 1;
      while (end < text.length && WORD.test(text[end])) end++;
      const url =
        text[end] === "(" && /^url$/i.test(text.slice(i, end))
          ? urlEnd(file, text, end)
          : null;
      push(url ?? end, true);
    } else push(i + 1, false);
  }
  return { comments, tokens };
}
