/**
 * The lexical readers behind the "Used in" map: what a source file imports,
 * and what a `ui/*` package publishes.
 *
 * Text, not a parser, and deliberately so — every input is Biome-formatted, so
 * the shapes are stable, and keeping the generator dependency-free is what
 * lets it run as plain `node scripts/gen-usage.mjs` with no loader.
 */

/**
 * The value-imported symbols a file takes from the modules `modulePattern`
 * matches.
 *
 * Type-only imports are deliberately excluded — importing `type
 * ModelPickerModel` is using a shape, not rendering a component, and counting
 * it would inflate every "Used in" row with files that paint no pixel.
 */
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

/** The value-imported `@houston-ai/*` symbols in a source file. */
export function importedSymbols(source) {
  return namedImports(source, "@houston-ai\\/[^\"']+");
}

/**
 * The value-imported symbols a file pulls in from a SIBLING module of its own
 * package (`import { KanbanBoard } from "./kanban-board"`).
 *
 * Cross-package imports alone under-report the inventory badly: a component
 * composed INSIDE its own package — `KanbanBoard` inside `AIBoard`, which is
 * what the app actually renders — reads as "nothing uses this", which is the
 * opposite of the truth. Same type-only exclusion as above, for the same
 * reason: a type import paints no pixel.
 */
export function relativeImports(source) {
  return namedImports(source, "\\.[^\"']*");
}

/**
 * Every symbol a `ui/<pkg>` publishes — `export { X } from "./y"` in its
 * index. A rename (`export { internal as Public }`) publishes the name AFTER
 * `as`, which is the one a consumer writes.
 */
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
