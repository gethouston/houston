import type {
  AnonymizedItem,
  AnonymizedRoutine,
  AnonymizedText,
  PortableAnonymizeResponse,
  RoutineFieldDiff,
  RoutineFieldOverride,
} from "@houston/protocol";
import {
  becameEmptyAfter,
  NO_PERSONAL_INFO,
  redactionCounts,
  redactText,
} from "./anonymize";
import type { PortableContent } from "./portable";

/**
 * The AI half of the anonymize pass (HOU-727). Pure shape work: flatten the
 * selected content into `{id, text}` items (regex-pre-redacted, so the model
 * only ever sees pattern-scrubbed text) and merge the model's redactions back
 * into the wizard's side-by-side response. The actual LLM call happens in the
 * agent's runtime (`runtime/src/session/anonymize.ts`) — the host wires the
 * two together.
 */

export interface AnonymizeAiItem {
  id: string;
  text: string;
}

export interface AnonymizeAiResult {
  text: string;
  summary: string;
}

/** The sentinel the model is prompted to emit when it redacted nothing. */
const AI_NONE = "no personal info detected";

const claudeMdId = "claudeMd";
const skillId = (slug: string) => `skill:${slug}`;
const routineFieldId = (id: string, field: "name" | "prompt") =>
  `routine:${id}:${field}`;
const learningId = (id: string) => `learning:${id}`;

/** Flatten the selected content into AI-pass items, regex-pre-redacted. */
export function collectAnonymizeItems(
  content: PortableContent,
): AnonymizeAiItem[] {
  const items: AnonymizeAiItem[] = [];
  if (content.claudeMd !== undefined) {
    items.push({ id: claudeMdId, text: redactText(content.claudeMd) });
  }
  for (const s of content.skills) {
    items.push({ id: skillId(s.slug), text: redactText(s.body) });
  }
  for (const r of content.routines) {
    items.push({ id: routineFieldId(r.id, "name"), text: redactText(r.name) });
    items.push({
      id: routineFieldId(r.id, "prompt"),
      text: redactText(r.prompt),
    });
  }
  for (const l of content.learnings) {
    items.push({ id: learningId(l.id), text: redactText(l.text) });
  }
  return items;
}

/** One diffed text: regex pre-pass + the model's redaction on top of it. */
function aiText(
  before: string,
  id: string,
  results: Map<string, AnonymizeAiResult>,
): AnonymizedText {
  const regexAfter = redactText(before);
  const ai = results.get(id);
  // Defensive: a missing id (the runtime validates completeness) degrades to
  // the regex result for that one item instead of dropping it.
  const after = ai?.text ?? regexAfter;

  const parts: string[] = [];
  const counts = redactionCounts(before);
  if (counts && regexAfter !== before) parts.push(`redacted ${counts}`);
  if (ai && ai.text !== regexAfter) {
    parts.push(
      ai.summary && ai.summary !== AI_NONE
        ? ai.summary
        : "redacted personal details",
    );
  }
  return {
    before,
    after,
    summary: parts.length ? parts.join("; ") : NO_PERSONAL_INFO,
    becameEmpty: becameEmptyAfter(after),
  };
}

/**
 * Merge the runtime's AI redactions into the wizard response. Mirrors
 * `anonymizeContent` exactly, with the model's output as the `after` texts.
 */
export function mergeAnonymizeResults(
  content: PortableContent,
  results: Map<string, AnonymizeAiResult>,
): PortableAnonymizeResponse {
  const skills: AnonymizedItem[] = content.skills.map((s) => ({
    id: s.slug,
    ...aiText(s.body, skillId(s.slug), results),
  }));

  const routines: AnonymizedRoutine[] = content.routines.map((routine) => {
    const fieldDiffs: RoutineFieldDiff[] = [];
    const overridePayload: RoutineFieldOverride = {};
    const fields = [
      ["name", routine.name],
      ["prompt", routine.prompt],
    ] as const;
    for (const [field, original] of fields) {
      const { after } = aiText(
        original,
        routineFieldId(routine.id, field),
        results,
      );
      if (after !== original) {
        fieldDiffs.push({ field, before: original, after });
        overridePayload[field] = after;
      }
    }
    return { id: routine.id, fieldDiffs, overridePayload };
  });

  return {
    claudeMd:
      content.claudeMd !== undefined
        ? aiText(content.claudeMd, claudeMdId, results)
        : null,
    skills,
    routines,
    learnings: content.learnings.map((l) => ({
      id: l.id,
      ...aiText(l.text, learningId(l.id), results),
    })),
    mode: "ai",
  };
}
