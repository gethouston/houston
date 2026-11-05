/** The widest value kept on one line before it is opened one level. */
const LINE_CHARS = 600;

/**
 * Deeper values stay minified. Each level re-stringifies its subtree, so an
 * unbounded walk is quadratic in depth and overflows the stack on a payload
 * nested thousands deep, which JSON.stringify alone handles.
 */
const MAX_OPEN_DEPTH = 32;

/**
 * An app's JSON result as the model reads it: a value that fits in
 * {@link LINE_CHARS} stays on one line, a bigger one opens one level with a
 * one-space indent, so a list of records comes out one record per line.
 *
 * Results are capped by characters (../tool-results/cap.ts). Two-space
 * pretty-printing spent 30-57% of typical app payloads (mail, chat, sheet and
 * CRM lists) on whitespace, so the head held fewer records and more results
 * spilled to a file. Short lines still matter: the model reads a spilled
 * result by line offset, which one minified line defeats.
 */
export function layoutJson(value: unknown, indent = ""): string {
  const flat = JSON.stringify(value) ?? "null";
  if (
    value === null ||
    typeof value !== "object" ||
    indent.length + flat.length <= LINE_CHARS ||
    indent.length >= MAX_OPEN_DEPTH
  ) {
    return flat;
  }
  const inner = `${indent} `;
  if (Array.isArray(value)) {
    const items = value.map((item) => inner + layoutJson(item, inner));
    return `[\n${items.join(",\n")}\n${indent}]`;
  }
  const fields = Object.entries(value)
    .filter(([, field]) => field !== undefined)
    .map(
      ([key, field]) =>
        `${inner}${JSON.stringify(key)}: ${layoutJson(field, inner)}`,
    );
  return `{\n${fields.join(",\n")}\n${indent}}`;
}
