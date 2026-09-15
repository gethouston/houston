import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { arrowExpressionBody } from "./assistant-ast.ts";
import type { PathHelper } from "./assistant-path-parts.ts";
import { repoRelative } from "./assistant-paths.ts";

/** Module-scope arrow helpers a file exports for other files' templates. */
export function sharedHelpers(source: ts.SourceFile): Map<string, PathHelper> {
  const helpers = new Map<string, PathHelper>();
  const visit = (node: ts.Node): void => {
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        const arrow = declaration.initializer
          ? arrowExpressionBody(declaration.initializer)
          : null;
        if (arrow && ts.isIdentifier(declaration.name))
          helpers.set(declaration.name.text, arrow);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return helpers;
}

/** sha256 over every source the catalog is derived from, path included. */
export function hashSources(paths: string[]): string {
  const hash = createHash("sha256");
  for (const path of paths)
    hash.update(`${repoRelative(path)}\n${readFileSync(path, "utf8")}\n`);
  return hash.digest("hex");
}
