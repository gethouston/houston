import ts from "typescript";

type WithDiagnostics = ts.SourceFile & {
  parseDiagnostics?: readonly ts.Diagnostic[];
};

function scriptKind(file: string): ts.ScriptKind {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (/\.[mc]?js$/.test(file)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function parseTs(file: string, text: string): ts.SourceFile {
  const source: WithDiagnostics = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(file),
  );
  const first = source.parseDiagnostics?.[0];
  if (first) {
    const at = source.getLineAndCharacterOfPosition(first.start ?? 0);
    const message = ts.flattenDiagnosticMessageText(first.messageText, " ");
    throw new Error(
      `${file}:${at.line + 1}:${at.character + 1} does not parse: ${message}`,
    );
  }
  return source;
}

export function isJsxChild(node: ts.Node): boolean {
  return ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent);
}

export function isJsxNode(node: ts.Node): boolean {
  return (
    ts.isJsxElement(node) ||
    ts.isJsxSelfClosingElement(node) ||
    ts.isJsxFragment(node)
  );
}
