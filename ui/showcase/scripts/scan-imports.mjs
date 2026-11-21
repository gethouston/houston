function namedImports(source, modulePattern) {
  const found = new Set();
  for (const [, clause] of source.matchAll(
    new RegExp(
      `^import\\s+([\\s\\S]*?)from\\s*["'](${modulePattern})["']`,
      "gm",
    ),
  )) {
    if (/^type\s/.test(clause)) continue;
    const braces = /\{([\s\S]*)\}/.exec(clause);
    if (!braces) continue;
    for (const raw of braces[1].split(",")) {
      const specifier = raw.trim();
      if (specifier === "" || /^type\s/.test(specifier)) continue;
      found.add(specifier.split(/\s+as\s+/)[0].trim());
    }
  }
  return found;
}

export function importedSymbols(source) {
  return namedImports(source, "@houston-ai\\/[^\"']+");
}

export function relativeImports(source) {
  return namedImports(source, "\\.[^\"']*");
}

export function publicExports(indexSource) {
  const found = new Set();
  for (const [, clause] of indexSource.matchAll(
    /^export\s+(\{[\s\S]*?\})\s*from\s*["']/gm,
  )) {
    for (const raw of clause.slice(1, -1).split(",")) {
      const specifier = raw.trim();
      if (specifier === "" || /^type\s/.test(specifier)) continue;
      found.add(
        specifier
          .split(/\s+as\s+/)
          .pop()
          .trim(),
      );
    }
  }
  return found;
}
