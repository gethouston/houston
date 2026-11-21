const LINE_CHARS = 600;

const MAX_OPEN_DEPTH = 32;

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
