import ts from "typescript";

export function parseLocaleJson(text, file) {
  const value = JSON.parse(text);
  const source = ts.parseJsonText(file, text);
  const duplicates = [];

  function visit(node, path) {
    if (ts.isObjectLiteralExpression(node)) {
      const keys = new Set();
      for (const property of node.properties) {
        const key = property.name.text;
        const keyPath = `${path}[${JSON.stringify(key)}]`;
        if (keys.has(key)) duplicates.push(keyPath);
        keys.add(key);
        visit(property.initializer, keyPath);
      }
    } else if (ts.isArrayLiteralExpression(node)) {
      for (const [index, element] of node.elements.entries()) {
        visit(element, `${path}[${index}]`);
      }
    }
  }

  visit(source.statements[0].expression, "$");
  if (duplicates.length > 0) {
    throw new Error(`${file}: duplicate JSON key at ${duplicates.join(", ")}`);
  }
  return value;
}
