import ts from "typescript";
import type { RawComment } from "./model.ts";
import { isJsxChild, parseTs } from "./parse-ts.ts";
import { publicDocStarts } from "./public-docs.ts";

type Span = [number, number];

const OPAQUE = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.RegularExpressionLiteral,
]);

function collect(source: ts.SourceFile): { opaque: Span[]; jsx: Span[] } {
  const opaque: Span[] = [];
  const jsx: Span[] = [];
  const visit = (node: ts.Node): void => {
    if (OPAQUE.has(node.kind)) {
      opaque.push([node.getStart(source), node.end]);
      return;
    }
    if (node.kind === ts.SyntaxKind.JsxText) {
      opaque.push([node.pos, node.end]);
      return;
    }
    if (ts.isJsxExpression(node) && !node.expression && isJsxChild(node))
      jsx.push([node.getStart(source), node.end]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  opaque.sort((a, b) => a[0] - b[0]);
  return { opaque, jsx };
}

function commentAt(
  file: string,
  text: string,
  at: number,
  limit: number,
): RawComment {
  const line = text[at + 1] === "/";
  const close = line ? text.slice(at).search(/[\n\r]/) : -1;
  const end = line
    ? close < 0
      ? text.length
      : at + close
    : text.indexOf("*/", at + 2) + 2;
  if (end < 2 || end > limit)
    throw new Error(
      `${file}: comment at offset ${at} runs into a literal or never closes`,
    );
  return { start: at, end, kind: line ? "line" : "block" };
}

function scanGap(
  file: string,
  text: string,
  from: number,
  to: number,
  out: RawComment[],
): void {
  let at = text.indexOf("/", from);
  while (at >= 0 && at < to) {
    const next = text[at + 1];
    if (next === "/" || next === "*") {
      const comment = commentAt(file, text, at, to);
      out.push(comment);
      at = text.indexOf("/", comment.end);
    } else at = text.indexOf("/", at + 1);
  }
}

function foldJsx(comments: RawComment[], jsx: Span[]): RawComment[] {
  const out: RawComment[] = [];
  for (const comment of comments) {
    const box = jsx.find(([s, e]) => comment.start > s && comment.end < e);
    if (!box) out.push(comment);
    else if (out.at(-1)?.start !== box[0])
      out.push({ start: box[0], end: box[1], kind: "jsx" });
  }
  return out;
}

export function tsComments(file: string, text: string): RawComment[] {
  const source = parseTs(file, text);
  const { opaque, jsx } = collect(source);
  const comments: RawComment[] = [];
  let cursor = text.startsWith("#!")
    ? text.indexOf("\n") + 1 || text.length
    : 0;
  for (const [start, end] of opaque) {
    if (start > cursor) scanGap(file, text, cursor, start, comments);
    cursor = Math.max(cursor, end);
  }
  scanGap(file, text, cursor, text.length, comments);
  const docs = publicDocStarts(source);
  for (const comment of comments)
    if (docs.has(comment.start)) comment.attached = true;
  return foldJsx(comments, jsx);
}
