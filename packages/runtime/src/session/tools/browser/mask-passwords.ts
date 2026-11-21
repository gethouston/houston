import { unquoted } from "./snapshot-tree";

const TEXTBOX_VALUE =
  /^(\s*- textbox(?: "(?:[^"\\]|\\.)*")?(?: \[[^\]]*\])*: )(.*)$/;

const TEXTBOX_PARENT =
  /^(\s*)- textbox(?: "(?:[^"\\]|\\.)*")?(?: \[[^\]]*\])*:$/;
const CHILD_TEXT = /^(\s*- text: )(.*)$/;

export function maskPasswords(
  tree: string,
  secrets: readonly string[],
): string {
  const hidden = new Set(secrets.map(asPrinted).filter((s) => s.length > 0));
  if (hidden.size === 0) return tree;
  const mask = (match: RegExpExecArray | null): string | undefined =>
    match?.[2] !== undefined && hidden.has(asPrinted(unquoted(match[2])))
      ? `${match[1]}[password hidden]`
      : undefined;
  let textboxIndent: number | undefined;
  return tree
    .split("\n")
    .map((line) => {
      const indent = line.length - line.trimStart().length;
      if (textboxIndent !== undefined && indent <= textboxIndent)
        textboxIndent = undefined;
      const parent = TEXTBOX_PARENT.exec(line);
      if (parent) {
        textboxIndent = indent;
        return line;
      }
      const own = mask(TEXTBOX_VALUE.exec(line));
      if (own !== undefined) return own;
      if (textboxIndent === undefined) return line;
      return mask(CHILD_TEXT.exec(line)) ?? line;
    })
    .join("\n");
}

function asPrinted(value: string): string {
  return value
    .replace(/[\u200b\u00ad]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}
