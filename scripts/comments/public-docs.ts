import ts from "typescript";

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

function publicMembers(node: ts.Node, out: ts.Node[]): void {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
    const visit = (child: ts.Node): void => {
      if (ts.isTypeElement(child)) out.push(child);
      ts.forEachChild(child, visit);
    };
    ts.forEachChild(node, visit);
  } else if (ts.isClassDeclaration(node)) {
    for (const member of node.members)
      if (
        !hasModifier(member, ts.SyntaxKind.PrivateKeyword) &&
        !hasModifier(member, ts.SyntaxKind.ProtectedKeyword) &&
        !(member.name && ts.isPrivateIdentifier(member.name))
      )
        out.push(member);
  } else if (ts.isEnumDeclaration(node)) out.push(...node.members);
}

function leadingDoc(source: ts.SourceFile, node: ts.Node): number | null {
  const text = source.text;
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) ?? [];
  const last = ranges.at(-1);
  if (!last || !text.startsWith("/**", last.pos)) return null;
  return last.pos;
}

export function publicDocStarts(source: ts.SourceFile): Set<number> {
  const local = locallyExported(source);
  const nodes: ts.Node[] = [];
  for (const statement of source.statements) {
    const exported =
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
