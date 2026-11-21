import type { RawComment, Token } from "./model.ts";
import type { Heredoc, ShellState } from "./shell-heredoc.ts";
import { heredocStart, readHeredocs } from "./shell-heredoc.ts";

type Frame =
  | { kind: "cmd"; close: ")" | "`" | null; depth: number }
  | { kind: "dq" }
  | { kind: "param" }
  | { kind: "arith"; depth: number };

export interface ShellLexed {
  comments: RawComment[];
  quoted: Uint8Array;
}

function stepOpen(s: ShellState, stack: Frame[], c: string): boolean {
  const { text, i } = s;
  if (c === "$" && text.startsWith("((", i + 1)) {
    stack.push({ kind: "arith", depth: 0 });
    s.i += 3;
    s.wordStart = false;
  } else if (c === "$" && text[i + 1] === "(") {
    stack.push({ kind: "cmd", close: ")", depth: 0 });
    s.i += 2;
    s.wordStart = true;
  } else if (c === "$" && text[i + 1] === "{") {
    stack.push({ kind: "param" });
    s.i += 2;
    s.wordStart = false;
  } else if (c === "`") {
    stack.push({ kind: "cmd", close: "`", depth: 0 });
    s.i += 1;
    s.wordStart = true;
  } else return false;
  return true;
}

function quoteTo(s: ShellState, from: number, close: number): void {
  if (close < 0) throw new Error(`${s.file}: unterminated quote at ${from}`);
  s.quoted.fill(1, from, close + 1);
  s.i = close + 1;
  s.wordStart = false;
}

function ansiEnd(text: string, from: number): number {
  let j = from + 2;
  while (j < text.length && text[j] !== "'") j += text[j] === "\\" ? 2 : 1;
  return j < text.length ? j : -1;
}

function stepCmd(
  s: ShellState,
  stack: Frame[],
  frame: Extract<Frame, { kind: "cmd" }>,
  comments: RawComment[],
): void {
  const { text, i } = s;
  const c = text[i];
  if (c === "\n") {
    s.i = readHeredocs(s, i + 1);
    s.wordStart = true;
  } else if (c === " " || c === "\t" || c === "\r") {
    s.i++;
    s.wordStart = true;
  } else if (c === "#" && s.wordStart) {
    const end = text.indexOf("\n", i);
    const stop = end < 0 ? text.length : end;
    comments.push({ start: i, end: stop, kind: "line" });
    s.i = stop;
  } else if (c === "\\") quoteTo(s, i, i + 1);
  else if (c === "'") quoteTo(s, i, text.indexOf("'", i + 1));
  else if (c === "$" && text[i + 1] === "'") quoteTo(s, i, ansiEnd(text, i));
  else if (c === '"') {
    stack.push({ kind: "dq" });
    s.quoted[i] = 1;
    s.i++;
    s.wordStart = false;
  } else if (c === "`" && frame.close === "`") {
    stack.pop();
    s.i++;
    s.wordStart = false;
  } else if (!stepOpen(s, stack, c)) stepPlain(s, stack, frame, c);
}

function stepPlain(
  s: ShellState,
  stack: Frame[],
  frame: Extract<Frame, { kind: "cmd" }>,
  c: string,
): void {
  const { text, i } = s;
  if (c === ")" && frame.depth === 0 && frame.close === ")") {
    stack.pop();
    s.i++;
    s.wordStart = false;
  } else if (text.startsWith("<<<", i)) {
    s.i += 3;
    s.wordStart = true;
  } else if (text.startsWith("<<", i)) {
    s.i = heredocStart(s, i + 2);
    s.wordStart = true;
  } else if ("()<>;&|".includes(c)) {
    if (c === "(") frame.depth++;
    if (c === ")" && frame.depth > 0) frame.depth--;
    s.i++;
    s.wordStart = true;
  } else {
    s.i++;
    s.wordStart = false;
  }
}

function stepInner(s: ShellState, stack: Frame[], frame: Frame): void {
  const { text, i } = s;
  const c = text[i];
  if (frame.kind !== "arith") s.quoted[i] = 1;
  if (frame.kind === "arith") {
    if (c === ")" && frame.depth === 0 && text[i + 1] === ")") {
      stack.pop();
      s.i += 2;
      return;
    }
    if (c === "(") frame.depth++;
    if (c === ")") frame.depth--;
    s.i++;
    return;
  }
  const closer = frame.kind === "dq" ? '"' : "}";
  if (c === closer) {
    stack.pop();
    s.i++;
  } else if (c === "\\") {
    s.quoted[i + 1] = 1;
    s.i += 2;
  } else if (frame.kind === "param" && c === '"') {
    stack.push({ kind: "dq" });
    s.i++;
  } else if (!stepOpen(s, stack, c)) s.i++;
}

export function lexShell(file: string, text: string): ShellLexed {
  const comments: RawComment[] = [];
  const s: ShellState = {
    file,
    text,
    i: 0,
    wordStart: true,
    quoted: new Uint8Array(text.length),
    heredocs: [] as Heredoc[],
  };
  if (text.startsWith("#!")) {
    const end = text.indexOf("\n");
    s.i = end < 0 ? text.length : end;
    s.quoted.fill(1, 0, s.i);
  }
  const stack: Frame[] = [{ kind: "cmd", close: null, depth: 0 }];
  while (s.i < text.length) {
    const frame = stack[stack.length - 1];
    if (frame.kind === "cmd") stepCmd(s, stack, frame, comments);
    else stepInner(s, stack, frame);
  }
  if (stack.length > 1 || s.heredocs.length > 0)
    throw new Error(`${file}: unterminated quote, substitution or heredoc`);
  return { comments, quoted: s.quoted };
}

export function shellTokens(text: string, lexed: ShellLexed): Token[] {
  const code = text.split("");
  for (const { start, end } of lexed.comments) code.fill(" ", start, end);
  const tokens: Token[] = [];
  let open = -1;
  let newline = false;
  const close = (at: number): void => {
    if (open >= 0)
      tokens.push({ text: code.slice(open, at).join(""), pos: open });
    open = -1;
  };
  code.forEach((ch, at) => {
    if (!lexed.quoted[at] && /\s/.test(ch)) {
      close(at);
      if (ch === "\n") newline = true;
      return;
    }
    if (open >= 0) return;
    if (newline && tokens.length > 0) tokens.push({ text: "\n", pos: at });
    newline = false;
    open = at;
  });
  close(code.length);
  return tokens;
}
