export interface Heredoc {
  delimiter: string;
  stripTabs: boolean;
}

export interface ShellState {
  file: string;
  text: string;
  i: number;
  wordStart: boolean;
  quoted: Uint8Array;
  heredocs: Heredoc[];
}

export function heredocStart(s: ShellState, from: number): number {
  const { text } = s;
  let j = from;
  const stripTabs = text[j] === "-";
  if (stripTabs) j++;
  while (text[j] === " " || text[j] === "\t") j++;
  const begin = j;
  while (j < text.length && !/[\s;&|<>()]/.test(text[j])) {
    const quote = text[j];
    if (quote === "'" || quote === '"') {
      const close = text.indexOf(quote, j + 1);
      if (close < 0) throw new Error(`${s.file}: unterminated quote at ${j}`);
      j = close + 1;
    } else j++;
  }
  const delimiter = text.slice(begin, j).replace(/["'\\]/g, "");
  if (delimiter) {
    s.heredocs.push({ delimiter, stripTabs });
    s.quoted.fill(1, begin, j);
  }
  return j;
}

export function readHeredocs(s: ShellState, from: number): number {
  const { text } = s;
  let i = from;
  for (const { delimiter, stripTabs } of s.heredocs) {
    for (;;) {
      if (i >= text.length)
        throw new Error(`${s.file}: heredoc ${delimiter} never ends`);
      const newline = text.indexOf("\n", i);
      const end = newline < 0 ? text.length : newline;
      const line = text.slice(i, end).replace(/\r$/, "");
      const bare = stripTabs ? line.replace(/^\t+/, "") : line;
      const last = bare === delimiter;
      s.quoted.fill(1, i, last ? end : end + 1);
      i = end + 1;
      if (last) break;
    }
  }
  s.heredocs = [];
  return Math.min(i, text.length);
}
