/**
 * Dependency-light helpers shared by the export adapters (Claude Skill ZIP +
 * universal copy-paste) and the agent-driven install instructions. Kept free of
 * DB/Next imports so adapters and unit tests can import them directly.
 */
import type { AgentIR } from "@houston/agentstore-contract";

/** Frontmatter `description` budget for the synthesized agent SKILL.md (matches
 *  the Claude.ai skill description cap). */
export const SKILL_DESCRIPTION_MAX = 1024;

/** Collapse any whitespace/newline run into a single space and trim. */
export function singleLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Truncate to at most `max` characters at a word boundary, appending a single
 * ellipsis character (counted within the budget). Returns the input untouched
 * when it already fits.
 */
export function truncateAtWord(s: string, max: number): string {
  if (s.length <= max) return s;
  const hardSlice = s.slice(0, max - 1); // leave room for the ellipsis
  const lastSpace = hardSlice.lastIndexOf(" ");
  const body = (
    lastSpace > 0 ? hardSlice.slice(0, lastSpace) : hardSlice
  ).replace(/[\s.,;:!?-]+$/, "");
  return `${body}…`;
}

/**
 * The frontmatter one-liner for an agent: its tagline, or the description
 * truncated to `max` at a word boundary when there is no tagline.
 */
export function taglineOrDescription(ir: AgentIR, max: number): string {
  const tagline = ir.identity.tagline?.trim();
  if (tagline) return singleLine(tagline);
  return truncateAtWord(singleLine(ir.identity.description), max);
}

/**
 * Emit a YAML scalar, quoting only when a bare value would be ambiguous: an empty
 * string, a leading indicator char or space, a trailing space, a colon-space or
 * space-hash sequence, a trailing colon, or an embedded quote/newline. A slug and
 * an ordinary sentence stay unquoted for a clean SKILL.md.
 */
export function yamlString(value: string): string {
  const needsQuote =
    value.length === 0 ||
    /^[\s\-?:,[\]{}#&*!|>@`"'%]/.test(value) ||
    /\s$/.test(value) ||
    /: |:$| #|[\n"']/.test(value);
  if (needsQuote) {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return value;
}

/** "Made by <displayName>" attribution, with the creator URL in parentheses when
 *  present. v2 creators have a display name + optional URL (no @handle). */
export function renderCredit(ir: AgentIR): string {
  const { creator } = ir.identity;
  return creator.url
    ? `Made by ${creator.displayName} (${creator.url})`
    : `Made by ${creator.displayName}`;
}
