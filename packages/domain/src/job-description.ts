// Reached by its package subpath rather than by `./job-description-yaml`: the
// app's unit tests load THIS module under plain `node
// --experimental-strip-types`, where an extensionless relative import does not
// resolve (`@houston/sdk/job-description` exists for the same reason).
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

/**
 * The agent's job description on disk: `<root>/CLAUDE.md`.
 *
 * The file is a structured document — a YAML frontmatter block holding the
 * user's own answer to what this agent is for (`industry`, `role`), then the
 * free-text description as the body:
 *
 * ```
 * ---
 * industry: Healthcare
 * role: Medical coder
 * ---
 *
 * (free description)
 * ```
 *
 * One grammar, three readers: the app's Instructions form, the agent itself
 * (which is told to keep the block intact when it rewrites the file), and the
 * runtime, which renders the whole block as plain lines above the body before
 * the model ever sees the text (`renderJobDescriptionForPrompt`).
 *
 * A file with no frontmatter — every job description written before the block
 * existed, and every one a user pastes in — is not an error: the fields are
 * null and the whole text is the body.
 */

/** The structured fields of the frontmatter block. `null` = the user left it blank. */
export type JobDescriptionFields = {
  industry: string | null;
  role: string | null;
};

export type ParsedJobDescription = {
  fields: JobDescriptionFields;
  /** The free description below the block, CRLF-normalized and trimmed. */
  body: string;
  /**
   * Every frontmatter key no field holds — the ones that are not
   * `industry`/`role`, plus a known key carrying a map or a list — in the order
   * the file carried them, so a rewrite never drops another writer's work.
   */
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
      // A body that merely OPENS with a `---` rule parses as something other
      // than a map. That is a plain job description, not a broken one: keep
      // the text.
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

  // A known key carrying a map or a list has no field to land in, so it rides
  // with the extras — in the file's own key order, since that order is the
  // other writer's — and a rewrite puts it back instead of deleting their work.
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

/**
 * Write the file back: the block (known fields first, then the keys the
 * previous text carried, in order), one blank line, the body. Both fields
 * blank and nothing else to preserve means no block at all — a job description
 * the user never answered for stays a plain document.
 *
 * The one exception is a body that itself OPENS with a fence: it gets an empty
 * block above it, because without one the next read would take the body's own
 * fenced lines for the header and the editor would lose them.
 */
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
    // A carried key the user has since answered is dropped here: two lines
    // under one YAML key would corrupt the block, and the answer is the newer
    // of the two.
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

/**
 * The job description as the model should read it: EVERY fact the block holds
 * as a plain line above the free description, blank ones dropped. Our own two
 * fields lead, under the labels the app asks for them with; every other key
 * follows in the order the file carried it, under the writer's own wording —
 * the key is theirs, not ours to rename. The model is told to keep the block
 * when it rewrites the file, but it never has to read YAML to know what the
 * agent is for, and nothing another writer put there is dropped on the way.
 *
 * A file with no block at all is its own body, unchanged.
 */
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
