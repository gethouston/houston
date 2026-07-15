/** Pure helpers shared by the marketplace card, preview sheet, and grid. */

/** GitHub org/user login from a `owner/repo` source string. */
export function ownerOf(source: string): string {
  return source.split("/")[0] ?? source;
}

/** GitHub repo name (without the owner) from a `owner/repo` source string. */
export function repoOf(source: string): string {
  return source.split("/")[1] ?? source;
}

/** "39500" -> "39.5K", "1200000" -> "1.2M". */
export function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** "vercel-react-best-practices" -> "Vercel React Best Practices" */
export function kebabToTitle(s: string): string {
  return s
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface FormattedSkillDescription {
  /** Prose before the first `(1)`-style marker, or the whole text when there's no list. */
  intro: string;
  /** Enumerated `(1) ... (2) ...` segments, split out as list items. Empty when none found. */
  items: string[];
  /** A trailing `Triggers on: "a", "b"` clause (LLM tool-matching keywords), pulled out of the prose. */
  keywords: string | null;
}

const TRIGGERS_RE = /\s*Triggers on:\s*(.+)$/i;
const ENUM_MARKER_RE = /\(\d+\)/;

/**
 * SKILL.md `description:` frontmatter is written for Claude's tool-matching,
 * not human reading — community skills often pack it as one run-on sentence
 * with an inline `(1) ... (2) ... (3) ...` enumeration and a trailing
 * `Triggers on: "..."` keyword list. Split those back into a readable shape
 * for the marketplace preview sheet instead of rendering the raw string.
 */
export function formatSkillDescription(
  description: string,
): FormattedSkillDescription {
  let text = description.trim();

  let keywords: string | null = null;
  const triggersMatch = text.match(TRIGGERS_RE);
  if (triggersMatch?.index !== undefined) {
    keywords = triggersMatch[1].trim().replace(/\.$/, "");
    text = text.slice(0, triggersMatch.index).trim();
  }

  const markerCount = (text.match(new RegExp(ENUM_MARKER_RE, "g")) ?? [])
    .length;
  const firstMarker = text.search(ENUM_MARKER_RE);
  if (markerCount < 2 || firstMarker === -1) {
    return { intro: text, items: [], keywords };
  }

  const intro = text.slice(0, firstMarker).trim();
  const items = text
    .slice(firstMarker)
    .split(/\(\d+\)\s*/)
    .map((s) => s.trim().replace(/,$/, "").trim())
    .filter(Boolean);

  return { intro, items, keywords };
}
