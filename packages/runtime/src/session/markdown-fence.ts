const FENCE_LINE = /^([ \t>]*)(`{3,}|~{3,})(.*)$/;
export const FENCE_PREFIX = /^[ \t>]*(?:`*|~*|`{3,}.*|~{3,}.*)$/s;
export const CLOSER_SHAPE = /^[ \t>]*(?:`{3,}|~{3,})[ \t]*$/;
export const FENCE_LINE_MAX = 512;

interface Container {
  quotes: number;
  indent: number;
}

export interface Fence extends Container {
  char: string;
  run: number;
}

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

export function endsContainer(line: string, fence: Fence): boolean {
  if (line.trim() === "") return false;
  const { quotes, indent } = containerOf(line, fence.quotes);
  return quotes < fence.quotes || indent < fence.indent - 3;
}

export function opens(line: string): Fence | null {
  const match = FENCE_LINE.exec(line);
  if (!match) return null;
  const [, , run = "", rest = ""] = match;
  const char = run.charAt(0);
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
