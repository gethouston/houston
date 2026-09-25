import {
  composeJobDescription,
  parseJobDescription,
} from "@houston/sdk/job-description";
import {
  type AgentRoleContext,
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
 * A brief with one fact answered again, normalized the way the create
 * normalizes it, or null when the answer is blank (a brief needs both). Any
 * job may pair with any industry, so a new industry keeps the job.
 */
export function briefWithAnswer(
  brief: AgentRoleContext,
  field: JobBriefField,
  answer: string,
): AgentRoleContext | null {
  const value = normalizeRolePart(answer);
  if (!value) return null;
  return field === "industry"
    ? { ...brief, context: value }
    : { ...brief, role: value };
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

/** Where an answer sits in its question: the catalog entry it is the label
 *  of, or the person's own words, capped like every typed answer. */
export type JobAnswerEntry<Id extends string> =
  | { id: Id; typed: "" }
  | { id: null; typed: string };

/**
 * The question's state for an answer given as the person reads it: the chip
 * it was picked from ({@link choiceIdForLabel}), else the typed answer holding
 * their words. What a picker opens on, and what an answer given elsewhere
 * (the employee card) sets the create flow's state to.
 */
export function jobAnswerEntry<Id extends string>(
  ids: readonly Id[],
  label: (id: Id) => string,
  answer: string | null,
): JobAnswerEntry<Id> {
  const id = choiceIdForLabel(ids, label, answer);
  return id
    ? { id, typed: "" }
    : { id: null, typed: capRolePart(answer ?? "") };
}
