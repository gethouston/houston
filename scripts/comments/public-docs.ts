import ts from "typescript";
import { TS_DIRECTIVE } from "./classify.ts";

function declarationNames(statement: ts.Statement): string[] {
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name) ? [declaration.name.text] : [],
    );
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name
  )
    return [statement.name.text];
  return [];
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some((modifier) => modifier.kind === kind)
  );
}

function locallyExported(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const statement of source.statements) {
    if (
      ts.isExportAssignment(statement) &&
      ts.isIdentifier(statement.expression)
    )
      names.add(statement.expression.text);
    if (
      !ts.isExportDeclaration(statement) ||
      statement.moduleSpecifier ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    )
      continue;
    for (const element of statement.exportClause.elements)
      names.add((element.propertyName ?? element.name).text);
  }
  return names;
}

function literalMembers(type: ts.TypeNode, out: ts.Node[]): void {
  if (ts.isParenthesizedTypeNode(type)) literalMembers(type.type, out);
  else if (ts.isTypeLiteralNode(type)) out.push(...type.members);
  else if (ts.isIntersectionTypeNode(type) || ts.isUnionTypeNode(type))
    for (const part of type.types) literalMembers(part, out);
}

function publicMembers(node: ts.Node, out: ts.Node[]): void {
  if (ts.isInterfaceDeclaration(node)) out.push(...node.members);
  else if (ts.isTypeAliasDeclaration(node)) literalMembers(node.type, out);
  else if (ts.isClassDeclaration(node)) {
    for (const member of node.members)
      if (
        !hasModifier(member, ts.SyntaxKind.PrivateKeyword) &&
        !hasModifier(member, ts.SyntaxKind.ProtectedKeyword) &&
        !(member.name && ts.isPrivateIdentifier(member.name))
      )
        out.push(member);
  } else if (ts.isEnumDeclaration(node)) out.push(...node.members);
}

function directive(text: string, range: ts.CommentRange): boolean {
  const body = text
    .slice(range.pos, range.end)
    .replace(/^\/\/\/?|^\/\*+|\*\/$/g, "")
    .trim();
  return TS_DIRECTIVE.test(body);
}

function leadingDoc(source: ts.SourceFile, node: ts.Node): number | null {
  const text = source.text;
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  let next = node.getStart(source);
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i];
    if (/\n[ \t]*\r?\n/.test(text.slice(range.end, next))) return null;
    if (text.startsWith("/**", range.pos)) return range.pos;
    if (!directive(text, range)) return null;
    next = range.pos;
  }
  return null;
}

export function publicDocStarts(source: ts.SourceFile): Set<number> {
  const local = locallyExported(source);
  const nodes: ts.Node[] = [];
  for (const statement of source.statements) {
    const exported =
      ts.isExportAssignment(statement) ||
      hasModifier(statement, ts.SyntaxKind.ExportKeyword) ||
      declarationNames(statement).some((name) => local.has(name));
    if (!exported) continue;
    nodes.push(statement);
    publicMembers(statement, nodes);
  }
  const starts = new Set<number>();
  for (const node of nodes) {
    const at = leadingDoc(source, node);
    if (at !== null) starts.add(at);
  }
  return starts;
}
