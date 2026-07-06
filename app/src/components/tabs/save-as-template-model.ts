/**
 * Pure, DOM/i18n-free helpers for the "Save as template" dialog (Teams v2).
 *
 * Two jobs, both unit-tested in isolation: assemble a {@link TemplateSpec} from
 * the data a manager is already viewing (instructions, skill bodies, model
 * config, allowed apps), and describe that spec as an ordered list of segments
 * the dialog renders as a plain-language "what this captures" summary
 * ("Instructions · 3 skills · Claude · 2 allowed apps"). The segments carry
 * only counts + ids so the component can localize each part — no English here.
 */

import type { TemplateSpec } from "@houston-ai/engine-client";

export interface AssembleSpecInput {
  /** The agent's CLAUDE.md instructions (verbatim; the gateway stores as-is). */
  instructions: string;
  /** Each skill's name + SKILL.md body, already loaded by the caller. */
  skills: { name: string; content: string }[];
  provider?: string;
  model?: string;
  effort?: string;
  /** The allowed-app ceiling; `null` = all apps allowed. */
  allowedToolkits: string[] | null;
}

/**
 * Map already-loaded agent data into a {@link TemplateSpec}. Optional model
 * fields are omitted (not emitted as empty strings) when absent, so a template
 * that pins no model carries none.
 */
export function assembleSpec(input: AssembleSpecInput): TemplateSpec {
  const spec: TemplateSpec = {
    instructions: input.instructions,
    skills: input.skills.map((s) => ({ name: s.name, content: s.content })),
    allowedToolkits: input.allowedToolkits,
  };
  if (input.provider) spec.provider = input.provider;
  if (input.model) spec.model = input.model;
  if (input.effort) spec.effort = input.effort;
  return spec;
}

/** One part of the plain-language "what this captures" summary. */
export type SpecSummarySegment =
  | { kind: "instructions" }
  | { kind: "skills"; count: number }
  | { kind: "model"; provider?: string; model?: string }
  | { kind: "allApps" }
  | { kind: "apps"; count: number };

export interface SummaryInput {
  instructions: string;
  skillCount: number;
  provider?: string;
  model?: string;
  allowedToolkits: string[] | null;
}

/**
 * Describe what a template would capture as ordered segments. Instructions and
 * skills segments appear only when there is something to capture; the model
 * segment only when a model is pinned; the apps segment is always present
 * (`allApps` when unrestricted, else the count of allowed apps).
 */
export function summarizeSpec(input: SummaryInput): SpecSummarySegment[] {
  const segments: SpecSummarySegment[] = [];
  if (input.instructions.trim().length > 0)
    segments.push({ kind: "instructions" });
  if (input.skillCount > 0) {
    segments.push({ kind: "skills", count: input.skillCount });
  }
  if (input.provider || input.model) {
    segments.push({
      kind: "model",
      provider: input.provider,
      model: input.model,
    });
  }
  if (input.allowedToolkits === null) segments.push({ kind: "allApps" });
  else segments.push({ kind: "apps", count: input.allowedToolkits.length });
  return segments;
}

/**
 * The friendly brand name for a pinned provider, or `null` for an unknown one
 * (brand names are not translated). Falls back to the raw model id at the call
 * site when this is `null`.
 */
export function providerBrand(provider?: string): string | null {
  switch (provider) {
    case "anthropic":
      return "Claude";
    case "openai":
      return "OpenAI";
    default:
      return null;
  }
}

/** Whether a template is savable: a non-empty name after trimming. */
export function canSaveTemplate(name: string): boolean {
  return name.trim().length > 0;
}

/**
 * Whether the allowed-app ceiling is known and safe to capture. In multiplayer
 * the agent-settings query MUST have resolved with data first: absent data
 * (still loading, or the fetch errored) reads as `null` = ALL apps, which would
 * silently over-permission the template past the agent's real restricted set.
 * In single-player there is no ceiling concept, so it is always ready.
 */
export function allowedToolkitsReady(
  multiplayer: boolean,
  hasSettingsData: boolean,
): boolean {
  return !multiplayer || hasSettingsData;
}
