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
  redactWithSecrets,
  type SecretRedactor,
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

/**
 * Flatten the selected content into AI-pass items, pre-redacted (regex
 * patterns + the secret redactor) — the model never sees raw emails, paths,
 * or credentials.
 */
export async function collectAnonymizeItems(
  content: PortableContent,
  redactSecrets?: SecretRedactor,
): Promise<AnonymizeAiItem[]> {
  const sources: AnonymizeAiItem[] = [];
  if (content.claudeMd !== undefined) {
    sources.push({ id: claudeMdId, text: content.claudeMd });
  }
  for (const s of content.skills) {
    sources.push({ id: skillId(s.slug), text: s.body });
  }
  for (const r of content.routines) {
    sources.push({ id: routineFieldId(r.id, "name"), text: r.name });
    sources.push({ id: routineFieldId(r.id, "prompt"), text: r.prompt });
  }
  for (const l of content.learnings) {
    sources.push({ id: learningId(l.id), text: l.text });
  }
  return Promise.all(
    sources.map(async ({ id, text }) => ({
      id,
      text: (await redactWithSecrets(text, redactSecrets)).after,
    })),
  );
}

/** One diffed text: the pre-pass + the model's redaction on top of it. */
async function aiText(
  before: string,
  id: string,
  results: Map<string, AnonymizeAiResult>,
  redactSecrets?: SecretRedactor,
): Promise<AnonymizedText> {
  const pre = await redactWithSecrets(before, redactSecrets);
  const ai = results.get(id);
  // Defensive: a missing id (the runtime validates completeness) degrades to
  // the pre-pass result for that one item instead of dropping it.
  const after = ai?.text ?? pre.after;

  const parts: string[] = [];
  if (pre.counts && pre.after !== before) parts.push(`redacted ${pre.counts}`);
  if (ai && ai.text !== pre.after) {
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
export async function mergeAnonymizeResults(
  content: PortableContent,
  results: Map<string, AnonymizeAiResult>,
  redactSecrets?: SecretRedactor,
): Promise<PortableAnonymizeResponse> {
  const skills: AnonymizedItem[] = await Promise.all(
    content.skills.map(async (s) => ({
      id: s.slug,
      ...(await aiText(s.body, skillId(s.slug), results, redactSecrets)),
    })),
  );

  const routines: AnonymizedRoutine[] = await Promise.all(
    content.routines.map(async (routine) => {
      const fieldDiffs: RoutineFieldDiff[] = [];
      const overridePayload: RoutineFieldOverride = {};
      const fields = [
        ["name", routine.name],
        ["prompt", routine.prompt],
      ] as const;
      for (const [field, original] of fields) {
        const { after } = await aiText(
          original,
          routineFieldId(routine.id, field),
          results,
          redactSecrets,
        );
        if (after !== original) {
          fieldDiffs.push({ field, before: original, after });
          overridePayload[field] = after;
        }
      }
      return { id: routine.id, fieldDiffs, overridePayload };
    }),
  );

  return {
    claudeMd:
      content.claudeMd !== undefined
        ? await aiText(content.claudeMd, claudeMdId, results, redactSecrets)
        : null,
    skills,
    routines,
    learnings: await Promise.all(
      content.learnings.map(async (l) => ({
        id: l.id,
        ...(await aiText(l.text, learningId(l.id), results, redactSecrets)),
      })),
    ),
    mode: "ai",
  };
}
