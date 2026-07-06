import type { TemplateSummary } from "@houston-ai/engine-client";

/**
 * Pure, DOM/i18n-free logic for the "create from template" picker (Teams v2).
 * Turns a {@link TemplateSummary} into the pieces of its one-line description
 * ("3 skills · Claude · 2 apps"). The component joins the localized parts; only
 * the shape logic lives here so it unit-tests under bare Node.
 */

/**
 * Map a template's pinned model id to its consumer-facing brand family
 * ("Claude", "GPT", "Gemini") for the summary line. Brand names are never
 * translated (see the i18n glossary), so they are literals here. An unknown id
 * falls back to the raw id rather than being dropped — the summary must never
 * silently omit a model the template pins. Returns `null` when no model is set.
 */
export function modelBrand(modelId: string | undefined | null): string | null {
  if (!modelId) return null;
  const id = modelId.toLowerCase();
  if (
    id.startsWith("claude") ||
    id.includes("sonnet") ||
    id.includes("opus") ||
    id.includes("haiku") ||
    id.includes("fable")
  ) {
    return "Claude";
  }
  if (
    id.startsWith("gpt") ||
    id.startsWith("o1") ||
    id.startsWith("o3") ||
    id.startsWith("o4") ||
    id.includes("codex")
  ) {
    return "GPT";
  }
  if (id.startsWith("gemini")) return "Gemini";
  return modelId;
}

/** The structured, localization-ready pieces of a template's summary line. */
export interface TemplateSummaryParts {
  /** Number of skills the template captures (always shown). */
  skillCount: number;
  /** Brand family of the pinned model, or `null` when the template pins none. */
  model: string | null;
  /** `true` when every app is allowed (`allowedToolkitCount === null`). */
  allApps: boolean;
  /** Count of allowed apps when restricted; `null` when {@link allApps}. */
  appCount: number | null;
}

/**
 * Derive the summary pieces from a template's cheap summary fields. The caller
 * localizes and joins them (skills → model brand → apps) with a middot.
 */
export function templateSummaryParts(
  t: Pick<TemplateSummary, "skillCount" | "model" | "allowedToolkitCount">,
): TemplateSummaryParts {
  const allApps = t.allowedToolkitCount === null;
  return {
    skillCount: t.skillCount,
    model: modelBrand(t.model),
    allApps,
    appCount: allApps ? null : t.allowedToolkitCount,
  };
}
