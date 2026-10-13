import {
  ASSISTANT_LEARNINGS_MAX_BYTES,
  activeLearnings,
  learningListLines,
  SHORT_LEARNING_ID_MIN,
} from "@houston/domain";
import {
  isArchivedLearning,
  type Learning,
  type LearningRefusalCode,
} from "@houston/protocol";

/**
 * What the agent is told when the assistant's memory is full. It reaches the
 * model verbatim (the route turns it into a 400 and `save_learning` relays the
 * body), so it is written as an instruction to the agent, never as a
 * user-facing error. The active list follows it ({@link memoryFullError}):
 * memories saved during this chat carry no id in the frozen system prompt.
 */
export const ASSISTANT_LEARNINGS_FULL_MESSAGE =
  "Your memory is full, so this memory was NOT saved. Make room first: call " +
  "save_learning with one merged memory that combines related or outdated " +
  "ones, passing the ids of the memories it replaces in `replaces` (replaced " +
  "memories are archived, not deleted, and stay searchable). Then save this " +
  "memory again. Never edit the learnings file with file tools. Never " +
  "mention files, limits, ids, or how your memory works to the user; if you " +
  "say anything, just say you are tidying up what you remember.";

/** A refused save: the agent-actionable words and why, for the runtime. */
export interface LearningRefusal {
  error: string;
  code: LearningRefusalCode;
}

/** The full-memory refusal plus every active memory, by short id. */
export function memoryFullError(items: readonly Learning[]): LearningRefusal {
  const error = [
    ASSISTANT_LEARNINGS_FULL_MESSAGE,
    "",
    "Your memories right now (the bracketed code is the id to pass in `replaces`):",
    ...boundedList(activeLearnings(items)),
  ].join("\n");
  return { error, code: "memory_full" };
}

/**
 * Resolve `replaces` refs to ACTIVE learnings: an exact id first, else a
 * unique prefix of at least {@link SHORT_LEARNING_ID_MIN} characters among
 * active learnings (the short ids the prompt and the full-memory error show).
 * Any unknown, ambiguous or already-archived ref refuses the whole save, so a
 * typo can never archive the wrong memory.
 */
export function resolveReplaces(
  items: readonly Learning[],
  refs: readonly string[],
): { ids: Set<string> } | LearningRefusal {
  const active = activeLearnings(items);
  const ids = new Set<string>();
  for (const raw of refs) {
    const ref = raw.trim();
    const exact = items.find((item) => item.id === ref);
    if (exact && !isArchivedLearning(exact)) {
      ids.add(exact.id);
      continue;
    }
    if (exact) return archivedRef(ref, exact);
    const matches =
      ref.length >= SHORT_LEARNING_ID_MIN
        ? active.filter((item) => item.id.startsWith(ref))
        : [];
    const [only] = matches;
    if (only && matches.length === 1) {
      ids.add(only.id);
      continue;
    }
    if (matches.length > 1) {
      return refusal(
        `"${ref}" in \`replaces\` matches more than one memory. Pass the full bracketed code.`,
        active,
      );
    }
    const archived = items.find(
      (item) =>
        isArchivedLearning(item) &&
        ref.length >= SHORT_LEARNING_ID_MIN &&
        item.id.startsWith(ref),
    );
    if (archived) return archivedRef(ref, archived);
    return refusal(
      `There is no memory "${ref}" to replace. Copy the bracketed code exactly from the list below.`,
      active,
    );
  }
  return { ids };
}

/**
 * The learning an identical earlier save already produced, when this save is
 * its retry: the host mints a new id per request, so a consolidation whose
 * response was lost comes back with refs that are all archived. When EVERY ref
 * names a memory archived by the same replacement, and that replacement is
 * active with exactly this text, the save already happened: answering it as
 * done keeps the model from re-saving without `replaces` and duplicating.
 */
export function priorConsolidation(
  items: readonly Learning[],
  refs: readonly string[],
  text: string,
): Learning | undefined {
  if (!refs.length) return undefined;
  const replacedBy = new Set<string | undefined>();
  for (const raw of refs) {
    const ref = raw.trim();
    const matches = items.filter(
      (item) =>
        item.id === ref ||
        (ref.length >= SHORT_LEARNING_ID_MIN && item.id.startsWith(ref)),
    );
    const [only] = matches;
    if (!only || matches.length !== 1 || !isArchivedLearning(only)) return;
    replacedBy.add(only.replaced_by);
  }
  const [id] = [...replacedBy];
  if (replacedBy.size !== 1 || !id) return undefined;
  const replacement = items.find((item) => item.id === id);
  return replacement &&
    !isArchivedLearning(replacement) &&
    replacement.text.trim() === text
    ? replacement
    : undefined;
}

/** Archive `ids` in place of a removal: stamped, kept, pointed at the new one. */
export function archiveReplaced(
  items: readonly Learning[],
  ids: ReadonlySet<string>,
  replacedBy: string,
  nowIso: string,
): Learning[] {
  return items.map((item) =>
    ids.has(item.id)
      ? { ...item, archived_at: nowIso, replaced_by: replacedBy }
      : item,
  );
}

function archivedRef(ref: string, learning: Learning): LearningRefusal {
  const error = `Nothing was saved: the memory "${ref}" was already replaced${
    learning.replaced_by ? ` by "${learning.replaced_by}"` : ""
  }. Leave it out of \`replaces\` and call save_learning again.`;
  return { error, code: "memory_replace_refused" };
}

function refusal(reason: string, active: readonly Learning[]): LearningRefusal {
  const error = [
    `Nothing was saved. ${reason}`,
    "",
    "Your memories right now:",
    ...boundedList(active),
  ].join("\n");
  return { error, code: "memory_replace_refused" };
}

/**
 * The listed memories, cut to about the assistant's cap: the Memory page and
 * the whole-document PUT bypass that cap, so the active list itself is
 * unbounded and must not flood a tool result.
 */
export function boundedList(active: readonly Learning[]): string[] {
  const lines = learningListLines(active);
  const kept: string[] = [];
  let bytes = 0;
  for (const line of lines) {
    bytes += Buffer.byteLength(line, "utf8") + 1;
    if (bytes > ASSISTANT_LEARNINGS_MAX_BYTES) break;
    kept.push(line);
  }
  if (kept.length === lines.length) return kept;
  return [
    ...kept,
    `[${lines.length - kept.length} more memories not listed to stay within bounds; houston_recall can find the rest by a word they contain]`,
  ];
}
