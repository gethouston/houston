import {
  AGENT_CONTEXT_IDS,
  type AgentContextId,
} from "../../lib/agent-role-catalog.ts";
import {
  type ChoiceOption,
  type ChoiceSection,
  foldForSearch,
} from "./choice-step-model.ts";

/** What the industry filter can reach: every one the catalog knows. */
export const CONTEXT_SEARCH_REACH = AGENT_CONTEXT_IDS.length;

/**
 * The context runs for a query — one run, because every industry is a peer and no
 * grouping of fifty of them reads better than the alphabet.
 *
 * The catalog holds ids alone, so the label an industry is READ and SEARCHED by
 * arrives from the caller's translations: sorting and matching both happen on
 * the translated label, which is what makes "logistica" find "Logística" and
 * the run read in scanning order in every language.
 *
 * A query nothing matches comes back with no runs at all, so the step can
 * offer the typed words themselves as the answer (`choiceSearchEmptyState`).
 */
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
