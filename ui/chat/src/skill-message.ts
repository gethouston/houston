import {
  type AttachmentReference,
  normalizeAttachmentReferences,
} from "./attachment-message.ts";

const MARKER_RE = /^<!--houston:skill (\{[\s\S]*?\})-->\s*\n?\n?/;
const LEGACY_MARKER_RE = /^<!--houston:action (\{[\s\S]*?\})-->\s*\n?\n?/;

export interface SkillInvocationField {
  label: string;
  value: string;
}

export interface SkillInvocation {
  /** Skill machine name (slug). */
  skill: string;
  /** Title-cased display name shown on the card. */
  displayName: string;
  /**
   * Either a full image URL or a Microsoft Fluent Emoji slug. The
   * renderer is responsible for resolving slugs to URLs.
   */
  image: string | null;
  /** Optional muted description for the card. */
  description: string;
  /** Composio toolkit slugs (e.g. "gmail", "slack") for the logo row. */
  integrations: string[];
  /** Ordered field labels + values the user filled. */
  fields: SkillInvocationField[];
  /** Optional text the user typed alongside the Skill. */
  message: string;
  /** Files uploaded with the Skill. Paths are for model context, not UI display. */
  attachments: AttachmentReference[];
}

/**
 * Try to extract a Skill-invocation payload from a user-message body.
 * Returns `null` when the message is plain text. Tolerant of trailing
 * whitespace.
 */
export function decodeSkillMessage(body: string): SkillInvocation | null {
  const match = body.match(MARKER_RE) ?? body.match(LEGACY_MARKER_RE);
  if (!match) return null;
  try {
    const payload = JSON.parse(match[1]) as Partial<SkillInvocation> &
      Record<string, unknown>;
    if (typeof payload?.skill !== "string") return null;
    return {
      skill: payload.skill,
      displayName: payload.displayName ?? humanize(payload.skill),
      image: payload.image ?? null,
      description: payload.description ?? "",
      integrations: payload.integrations ?? [],
      fields: payload.fields ?? [],
      message: payload.message ?? "",
      attachments: normalizeAttachmentReferences(payload.attachments),
    };
  } catch {
    return null;
  }
}

/**
 * Resolve an `image` value (full URL or Fluent slug) to a renderable URL.
 * Slugs hit the jsDelivr mirror of `microsoft/fluentui-emoji@main/assets`.
 * Used by both the desktop and mobile renderers so the visual stays
 * consistent.
 */
export function resolveSkillImage(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const parts = trimmed
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  if (parts.length === 0) return null;
  const folder =
    parts[0].charAt(0).toUpperCase() +
    parts[0].slice(1) +
    (parts.length > 1 ? ` ${parts.slice(1).join(" ")}` : "");
  const file = `${parts.join("_")}_flat.svg`;
  return `https://cdn.jsdelivr.net/gh/microsoft/fluentui-emoji@main/assets/${encodeURIComponent(folder)}/Flat/${file}`;
}

function humanize(slug: string): string {
  const spaced = slug.replace(/[-_]+/g, " ").trim();
  return spaced.length === 0
    ? slug
    : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
