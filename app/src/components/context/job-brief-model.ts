import {
  composeJobDescription,
  parseJobDescription,
} from "@houston/sdk/job-description";
import {
  capRolePart,
  normalizeRolePart,
} from "../../lib/agent-role-context.ts";
import { foldForSearch } from "../shell/choice-step-model.ts";

/** The two facts the Job description tab edits as rows, above the editor. */
export type JobBriefField = "industry" | "role";

/**
 * The typed answer of the job-brief question after one write into it, wherever
 * the words came from: the user typing them, or the filter's own query being
 * taken as the answer. Every door into the field goes through here, so none of
 * them is wider than the one the field's own `maxLength` guards.
 */
export function typedJobAnswer(value: string): {
  active: true;
  value: string;
} {
  return { active: true, value: capRolePart(value) };
}

/**
 * Write one fact back into the job description, leaving everything else
 * exactly as it stands — the free description below, the other fact, and any
 * frontmatter key the agent keeps for itself.
 *
 * The answer is normalized the way the create dialog normalizes it, so the
 * same words typed in either place land in the file identically.
 */
export function withJobField(
  text: string,
  field: JobBriefField,
  value: string,
): string {
  const { fields, body } = parseJobDescription(text);
  return composeJobDescription(
    { ...fields, [field]: normalizeRolePart(value), body },
    text,
  );
}

/**
 * Write the free description back, keeping the block above it. The editor
 * below the pills only ever sees the description, so this is how its save
 * becomes a whole file again.
 */
export function withJobBody(text: string, body: string): string {
  const { fields } = parseJobDescription(text);
  return composeJobDescription({ ...fields, body }, text);
}

/**
 * The catalog id a stored answer came from, or null when the user typed their
 * own words. Matching is accent- and case-blind ({@link foldForSearch}), so a
 * value saved under one locale's capitalization still opens the picker on the
 * chip it was picked from.
 *
 * The file stores LABELS, never ids — that is what makes an agent's own edit
 * of the file a first-class way to answer these questions — so the picker has
 * to find its way back to the chip like this.
 */
export function choiceIdForLabel<Id extends string>(
  ids: readonly Id[],
  label: (id: Id) => string,
  value: string | null,
): Id | null {
  const needle = foldForSearch((value ?? "").trim());
  if (!needle) return null;
  return ids.find((id) => foldForSearch(label(id)) === needle) ?? null;
}
