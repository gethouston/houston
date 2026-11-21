import ts from "typescript";
import type { Token } from "./model.ts";
import { isJsxChild, isJsxNode, parseTs } from "./parse-ts.ts";

export function normalizeJsxText(raw: string): string {
  const lines = raw.split(/\r\n|\n|\r/);
  let lastFilled = -1;
  lines.forEach((line, index) => {
    if (/[^ \t]/.test(line)) lastFilled = index;
  });
  let out = "";
  lines.forEach((line, index) => {
    let piece = line.replace(/\t/g, " ");
    if (index > 0) piece = piece.replace(/^ +/, "");
    if (index < lines.length - 1) piece = piece.replace(/ +$/, "");
    if (!piece) return;
    out += index === lastFilled ? piece : `${piece} `;
  });
  return out;
}

function isJsDoc(node: ts.Node): boolean {
  return (
    node.kind >= ts.SyntaxKind.FirstJSDocNode &&
    node.kind <= ts.SyntaxKind.LastJSDocNode
  );
}

function spaceLiteral(node: ts.JsxExpression): string | null {
  const inner = node.expression;
  if (!inner || !ts.isStringLiteral(inner)) return null;
  return /^ +$/.test(inner.text) ? inner.text : null;
}

function droppedSeparator(tokens: readonly Token[], index: number): boolean {
  const token = tokens[index].text;
  const next = tokens[index + 1]?.text;
  if (token === ";") return next === "}";
  if (token !== ",") return false;
  const previous = tokens[index - 1]?.text;
  const closes = next === ")" || next === "]" || next === "}" || next === ">";
  return closes && previous !== "[" && previous !== ",";
}

function isComma(node: ts.Expression): boolean {
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.CommaToken
  );
}

function redundantParens(node: ts.ParenthesizedExpression): boolean {
  const inner = node.expression;
  if (isJsxNode(inner)) return true;
  if (isComma(inner)) return false;
  const parent = node.parent;
  if (ts.isReturnStatement(parent) || ts.isThrowStatement(parent)) return true;
  if (ts.isJsxExpression(parent)) return true;
  if (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent))
    return parent.initializer === node;
  return (
    ts.isArrowFunction(parent) &&
    parent.body === node &&
    !ts.isObjectLiteralExpression(inner)
  );
}

function leadingOperator(node: ts.Node, source: ts.SourceFile): number | null {
  if (!ts.isUnionTypeNode(node) && !ts.isIntersectionTypeNode(node))
    return null;
  const first = node.getFirstToken(source);
  const kind = first?.kind;
  if (kind !== ts.SyntaxKind.BarToken && kind !== ts.SyntaxKind.AmpersandToken)
    return null;
  return first ? first.getStart(source) : null;
}

function isModuleLink(statement: ts.Statement): boolean {
  if (ts.isImportDeclaration(statement)) return true;
  return ts.isExportDeclaration(statement) && !!statement.moduleSpecifier;
}

function linkRuns(source: ts.SourceFile): [number, number][][] {
  const runs: [number, number][][] = [];
  let run: [number, number][] = [];
  for (const statement of source.statements) {
    if (isModuleLink(statement))
      run.push([statement.getStart(source), statement.end]);
    else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

function sortLinkRuns(tokens: Token[], source: ts.SourceFile): Token[] {
  const out: Token[] = [];
  let at = 0;
  for (const run of linkRuns(source)) {
    while (at < tokens.length && tokens[at].pos < run[0][0])
      out.push(tokens[at++]);
    const units = run.map(([start, end]) => {
      const parts: string[] = [];
      while (at < tokens.length && tokens[at].pos < end)
        parts.push(tokens[at++].text);
      return { text: parts.join(" "), pos: start };
    });
    out.push(
      ...units.sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)),
    );
  }
  return out.concat(tokens.slice(at));
}

export function tsTokens(file: string, text: string): Token[] {
  const source = parseTs(file, text);
  const out: Token[] = [];
  const skipped = new Set<number>();
  let pending: Token | null = null;
  const addText = (value: string, pos: number): void => {
    if (!value) return;
    if (pending) pending.text += value;
    else pending = { text: value, pos };
  };
  const emit = (value: string, pos: number): void => {
    if (pending) out.push(pending);
    pending = null;
    out.push({ text: value, pos });
  };
  const walk = (node: ts.Node): void => {
    if (isJsDoc(node)) return;
    if (node.kind === ts.SyntaxKind.JsxText) {
      addText(normalizeJsxText(text.slice(node.pos, node.end)), node.pos);
      return;
    }
    if (ts.isJsxExpression(node) && isJsxChild(node)) {
      if (!node.expression) return;
      const space = spaceLiteral(node);
      if (space !== null) {
        addText(space, node.getStart(source));
        return;
      }
    }
    if (ts.isParenthesizedExpression(node) && redundantParens(node)) {
      walk(node.expression);
      return;
    }
    const operator = leadingOperator(node, source);
    if (operator !== null) skipped.add(operator);
    const children = node.getChildren(source);
    if (children.length > 0) {
      for (const child of children) walk(child);
      return;
    }
    const start = node.getStart(source);
    if (skipped.has(start)) return;
    if (node.end > start && node.kind !== ts.SyntaxKind.EndOfFileToken)
      emit(text.slice(start, node.end), start);
  };
  walk(source);
  if (pending) out.push(pending);
  const kept = out.filter((_, index) => !droppedSeparator(out, index));
  return sortLinkRuns(kept, source);
}
