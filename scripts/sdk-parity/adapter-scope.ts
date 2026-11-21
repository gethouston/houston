import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null;
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.ts`, `${base}/index.ts`])
    if (candidate.endsWith(".ts") && existsSync(candidate)) return candidate;
  return null;
}

export function importedFrom(source: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const statement of source.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.importClause?.isTypeOnly ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    )
      continue;
    const file = resolveImport(source.fileName, statement.moduleSpecifier.text);
    if (!file) continue;
    const clause = statement.importClause;
    if (clause?.name) out.set(clause.name.text, file);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings))
      out.set(bindings.name.text, file);
    else if (bindings && ts.isNamedImports(bindings))
      for (const element of bindings.elements)
        if (!element.isTypeOnly) out.set(element.name.text, file);
  }
  return out;
}

export function localNames(source: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name
    )
      names.add(node.name.text);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name))
      names.add(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return names;
}
