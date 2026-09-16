import type {
  PreviewSkillDetail,
  SkillStepIntegration,
  SkillWorkflowStepItem,
} from "./types";

/**
 * The optional detail sections a loaded preview can populate. Each field is
 * empty (`null` / `[]`) exactly when its section must NOT render, so the modal
 * never shows an empty heading, a blank chip, or an expander over nothing.
 */
export interface SkillPreviewSections {
  category: string | null;
  tags: string[];
  /**
   * Raw frontmatter toolkit slugs, still in author casing: resolving a slug to
   * an app name/logo is a Composio-catalog concern that belongs to `app/`.
   */
  integrations: string[];
  /** Full SKILL.md body, trimmed; null when the host had none to give. */
  instructions: string | null;
  /**
   * The skill's procedure as numbered steps. Non-empty only for a
   * Houston-authored skill: those show the steps as the body and keep the raw
   * instructions behind the disclosure.
   */
  workflow: SkillWorkflowStepItem[];
}

const EMPTY: SkillPreviewSections = {
  category: null,
  tags: [],
  integrations: [],
  instructions: null,
  workflow: [],
};

/**
 * Normalizes a loaded {@link PreviewSkillDetail} into the sections the modal
 * renders. The preview comes from hand-authored SKILL.md frontmatter, so the
 * fields arrive padded, blank, duplicated, or (untrusted YAML) not strings at
 * all. Trimming + deduping here keeps chip keys unique and stops a `tags: [""]`
 * skill from rendering a ghost pill.
 */
export function skillPreviewSections(
  preview: PreviewSkillDetail | null | undefined,
): SkillPreviewSections {
  if (!preview) return EMPTY;
  const category = cleanText(preview.category);
  return {
    category,
    // A tag repeating the category ("Marketing" + tags: [marketing]) would
    // render the same word twice, chip over pill — the category wins.
    tags: cleanList(preview.tags).filter(
      (tag) => tag.toLowerCase() !== category?.toLowerCase(),
    ),
    integrations: cleanList(preview.integrations),
    instructions: cleanText(preview.content),
    workflow: cleanSteps(preview.workflow),
  };
}

/** Drops any step the parser couldn't title — a chip with no action beside it. */
function cleanSteps(steps: unknown): SkillWorkflowStepItem[] {
  if (!Array.isArray(steps)) return [];
  const out: SkillWorkflowStepItem[] = [];
  for (const step of steps) {
    if (typeof step !== "object" || step === null) continue;
    const { title, detail, integration } = step as SkillWorkflowStepItem;
    const cleanTitle = cleanText(title);
    if (cleanTitle)
      out.push({
        title: cleanTitle,
        detail: cleanText(detail),
        integration: cleanIntegration(integration),
      });
  }
  return out;
}

/**
 * The app a step acts on, or null. A tag with no toolkit is no app at all, so
 * the step renders without a chip rather than with a blank one.
 */
function cleanIntegration(value: unknown): SkillStepIntegration | null {
  if (typeof value !== "object" || value === null) return null;
  const { toolkit, action } = value as SkillStepIntegration;
  const slug = cleanText(toolkit);
  return slug ? { toolkit: slug, action: cleanText(action) } : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = cleanText(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}
