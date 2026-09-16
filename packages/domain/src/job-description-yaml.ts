import { stringify as stringifyYaml } from "yaml";

/**
 * The grammar of the job-description file and the coercions its values need:
 * what a frontmatter block looks like in text, and how one YAML value becomes a
 * field, a prompt line, or a line written back. Knows nothing of which fields
 * the app asks for — that is `job-description.ts`.
 */

/**
 * The block, its inner text, and the body below it. The inner group is lazily
 * OPTIONAL (`??`) so a closing fence on the very next line wins over any later
 * one: an empty block (`---\n---`) is a block, which is what lets a body that
 * itself opens with a fence be written under one and read back unchanged.
 */
export const FRONTMATTER =
  /^---\r?\n(?:([\s\S]*?)\r?\n)??---[ \t]*(?:\r?\n([\s\S]*))?$/;

/**
 * A byte-order mark (many Windows editors and tools write one) or a leading
 * blank line sits ABOVE the opening fence, where it would push the block out of
 * {@link FRONTMATTER}'s anchor and show the user their own YAML as prose.
 */
export const LEADING_NOISE = /^\uFEFF?(?:[ \t]*\r?\n)*/;

/** A map or a list: what no field can hold and a rewrite must carry whole. */
export const isStructured = (value: unknown): boolean =>
  typeof value === "object" && value !== null;

/** Frontmatter scalars reach us as whatever YAML made of them; only text is a field. */
export const asText = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return null;
};

export const normalize = (text: string): string =>
  text.replace(/\r\n/g, "\n").trim();

/**
 * One frontmatter value as ONE prompt line, or null when it says nothing — a
 * blank or absent scalar included, which is why only a structure falls through
 * to JSON (an empty string would otherwise reach the model as `""`). A scalar
 * reads as itself ({@link asText}); a map or list reads as compact JSON, which
 * keeps it on the single line this rendering has room for and keeps
 * `[object Object]` out of the model's context.
 */
export function promptValue(value: unknown): string | null {
  const text = asText(value);
  if (text !== null) return text;
  if (!isStructured(value)) return null;
  const json = JSON.stringify(value);
  return json && json !== "{}" && json !== "[]" ? json : null;
}

/**
 * One `key: value` line. The yaml serializer decides the quoting (plain when
 * the value is safe, JSON-style double quotes when it is not — `singleQuote:
 * false`), and anything it would fold onto several lines (a value with a
 * newline) becomes a JSON string instead, so a SCALAR line always stays one
 * line. A map or a list keeps the indented shape YAML gives it, which is the
 * only way it reads back as the same structure.
 */
export function yamlLine(key: string, value: unknown): string {
  const line = stringifyYaml(
    { [key]: value },
    { singleQuote: false, lineWidth: 0 },
  ).replace(/\n$/, "");
  if (!line.includes("\n")) return line;
  return typeof value === "string" ? `${key}: ${JSON.stringify(value)}` : line;
}
