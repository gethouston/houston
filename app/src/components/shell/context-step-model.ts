import {
  AGENT_CONTEXT_IDS,
  type AgentContextId,
} from "../../lib/agent-role-catalog.ts";
import {
  type ChoiceOption,
  type ChoiceSection,
  foldForSearch,
} from "./choice-step-model.ts";

export const CONTEXT_SEARCH_REACH = AGENT_CONTEXT_IDS.length;

export function contextRunsForQuery(
  query: string,
  label: (id: AgentContextId) => string,
): ChoiceSection[] {
  const needle = foldForSearch(query.trim());
  const options: ChoiceOption[] = AGENT_CONTEXT_IDS.map((id) => ({
    id,
    label: label(id),
  }))
    .filter((option) => !needle || foldForSearch(option.label).includes(needle))
    .sort((a, b) => a.label.localeCompare(b.label));

  return options.length ? [{ id: "contexts", options }] : [];
}
