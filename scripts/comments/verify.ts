import type { Comment, Pinned, Token } from "./model.ts";
import { scanSource, tokensOf } from "./scan.ts";
import { lineStarts, positionOf } from "./text.ts";

export interface Side {
  text: string;
  line: number;
  col: number;
}

export interface Mismatch {
  index: number;
  base: Side | null;
  work: Side | null;
}

function side(
  tokens: readonly Token[],
  index: number,
  starts: readonly number[],
): Side | null {
  const token = tokens[index];
  if (!token) return null;
  return { text: token.text, ...positionOf(starts, token.pos) };
}

export function compareTokens(
  file: string,
  baseText: string,
  workText: string,
): Mismatch | null {
  const base = tokensOf(file, baseText);
  const work = tokensOf(file, workText);
  let index = 0;
  while (
    index < base.length &&
    index < work.length &&
    base[index].text === work[index].text
  )
    index++;
  if (index === base.length && index === work.length) return null;
  return {
    index,
    base: side(base, index, lineStarts(baseText)),
    work: side(work, index, lineStarts(workText)),
  };
}

export function describeMismatch(file: string, mismatch: Mismatch): string {
  const show = (label: string, at: Side | null): string =>
    at
      ? `${label} ${at.line}:${at.col} ${JSON.stringify(at.text)}`
      : `${label} has no token here`;
  return `${file}: token ${mismatch.index} differs: ${show("base", mismatch.base)}, ${show("working tree", mismatch.work)}`;
}

function toolingOf(file: string, text: string, pinned: readonly Pinned[]) {
  return scanSource(file, text, pinned)
    .filter((comment) => comment.role === "tooling")
    .map((comment) => ({
      comment,
      key: comment.text
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/(biome-ignore[^:]*):.*$/, "$1:"))
        .join("\n"),
    }));
}

export function compareTooling(
  file: string,
  baseText: string,
  workText: string,
  pinned: readonly Pinned[],
): string | null {
  const base = toolingOf(file, baseText, pinned);
  const work = toolingOf(file, workText, pinned);
  let index = 0;
  while (
    index < base.length &&
    index < work.length &&
    base[index].key === work[index].key
  )
    index++;
  if (index === base.length && index === work.length) return null;
  const show = (label: string, comment: Comment | undefined): string =>
    comment
      ? `${label} ${comment.line}:${comment.col} ${JSON.stringify(comment.text.split("\n")[0])}`
      : `${label} has no tooling comment here`;
  return `${file}: tooling comment ${index} differs: ${show("base", base[index]?.comment)}, ${show("working tree", work[index]?.comment)}`;
}

export function verifyFile(
  file: string,
  baseText: string,
  workText: string,
  options: { pinned: readonly Pinned[]; allowCode: boolean },
): string[] {
  const problems: string[] = [];
  if (!options.allowCode) {
    const mismatch = compareTokens(file, baseText, workText);
    if (mismatch) problems.push(describeMismatch(file, mismatch));
  }
  const tooling = compareTooling(file, baseText, workText, options.pinned);
  if (tooling) problems.push(tooling);
  return problems;
}
