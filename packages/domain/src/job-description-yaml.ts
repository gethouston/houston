import { stringify as stringifyYaml } from "yaml";

export const FRONTMATTER =
  /^---\r?\n(?:([\s\S]*?)\r?\n)??---[ \t]*(?:\r?\n([\s\S]*))?$/;

export const LEADING_NOISE = /^\uFEFF?(?:[ \t]*\r?\n)*/;

export const isStructured = (value: unknown): boolean =>
  typeof value === "object" && value !== null;

export const asText = (value: unknown): string | null => {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return null;
};

export const normalize = (text: string): string =>
  text.replace(/\r\n/g, "\n").trim();

export function promptValue(value: unknown): string | null {
  const text = asText(value);
  if (text !== null) return text;
  if (!isStructured(value)) return null;
  const json = JSON.stringify(value);
  return json && json !== "{}" && json !== "[]" ? json : null;
}

export function yamlLine(key: string, value: unknown): string {
  const line = stringifyYaml(
    { [key]: value },
    { singleQuote: false, lineWidth: 0 },
  ).replace(/\n$/, "");
  if (!line.includes("\n")) return line;
  return typeof value === "string" ? `${key}: ${JSON.stringify(value)}` : line;
}
