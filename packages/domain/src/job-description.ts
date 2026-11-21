import {
  asText,
  FRONTMATTER,
  isStructured,
  LEADING_NOISE,
  normalize,
  promptValue,
  yamlLine,
} from "@houston/domain/job-description-yaml";
import { parse as parseYaml } from "yaml";

export type JobDescriptionFields = {
  industry: string | null;
  role: string | null;
};

export type ParsedJobDescription = {
  fields: JobDescriptionFields;
  body: string;
  extraKeys: Record<string, unknown>;
};

const KNOWN_KEYS = ["industry", "role"] as const;

const isKnown = (key: string): key is (typeof KNOWN_KEYS)[number] =>
  (KNOWN_KEYS as readonly string[]).includes(key);

export function parseJobDescription(text: string): ParsedJobDescription {
  const match = text.replace(LEADING_NOISE, "").match(FRONTMATTER);
  const whole = {
    fields: { industry: null, role: null },
    body: normalize(text),
    extraKeys: {},
  } satisfies ParsedJobDescription;
  if (!match) return whole;

  const inner = match[1] ?? "";
  let frontmatter: Record<string, unknown> = {};
  if (inner.trim()) {
    try {
      const parsed = parseYaml(inner) as unknown;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed)
      )
        return whole;
      frontmatter = parsed as Record<string, unknown>;
    } catch {
      return whole;
    }
  }

  const extraKeys: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(frontmatter)) {
    if (!isKnown(key) || isStructured(value)) extraKeys[key] = value;
  }
  return {
    fields: {
      industry: asText(frontmatter.industry),
      role: asText(frontmatter.role),
    },
    body: normalize(match[2] ?? ""),
    extraKeys,
  };
}

export function composeJobDescription(
  fields: JobDescriptionFields & { body: string },
  previous?: string,
): string {
  const extraKeys = previous ? parseJobDescription(previous).extraKeys : {};
  const lines = [
    ...KNOWN_KEYS.flatMap((key) => {
      const value = fields[key]?.trim();
      return value ? [yamlLine(key, value)] : [];
    }),
    ...Object.entries(extraKeys).flatMap(([key, value]) =>
      isKnown(key) && fields[key]?.trim() ? [] : [yamlLine(key, value)],
    ),
  ];
  const body = normalize(fields.body);
  const block =
    lines.length || body.startsWith("---")
      ? `---\n${lines.map((line) => `${line}\n`).join("")}---\n`
      : "";
  if (!body) return block;
  return block ? `${block}\n${body}\n` : `${body}\n`;
}

export function renderJobDescriptionForPrompt(text: string): string {
  const { fields, body, extraKeys } = parseJobDescription(text);
  const lines = [
    ...(fields.industry ? [`Industry: ${fields.industry}`] : []),
    ...(fields.role ? [`Role: ${fields.role}`] : []),
    ...Object.entries(extraKeys).flatMap(([key, value]) => {
      const rendered = promptValue(value);
      return rendered ? [`${key}: ${rendered}`] : [];
    }),
  ];
  if (!lines.length) return body;
  return body ? `${lines.join("\n")}\n\n${body}` : lines.join("\n");
}
