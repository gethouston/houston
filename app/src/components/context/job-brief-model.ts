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

export type JobBriefField = "industry" | "role";

export function typedJobAnswer(value: string): {
  active: true;
  value: string;
} {
  return { active: true, value: capRolePart(value) };
}

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

export function withJobBody(text: string, body: string): string {
  const { fields } = parseJobDescription(text);
  return composeJobDescription({ ...fields, body }, text);
}

export function choiceIdForLabel<Id extends string>(
  ids: readonly Id[],
  label: (id: Id) => string,
  value: string | null,
): Id | null {
  const needle = foldForSearch((value ?? "").trim());
  if (!needle) return null;
  return ids.find((id) => foldForSearch(label(id)) === needle) ?? null;
}

export type JobAnswerEntry<Id extends string> =
  | { id: Id; typed: "" }
  | { id: null; typed: string };

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
