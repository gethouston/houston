import type {
  AssistantCatalog,
  AssistantOperation,
} from "@houston/host/src/assistant/catalog";
import { callableOperations } from "./assistant-callable";

/**
 * The catalog's read side: the group index and the substring search behind
 * `houston_capabilities`. Pure functions over a catalog, so the tool layer
 * stays about wording and the matching rules stay testable on their own.
 */

/** One group and how many callable operations it holds. */
export interface AssistantGroupCount {
  group: string;
  count: number;
}

/** An operation as the INDEX shows it: no schemas — `houston_describe` has those. */
export interface AssistantOperationSummary {
  name: string;
  group: string;
  description: string;
  confirm: boolean;
}

export interface AssistantSearchInput {
  query?: string;
  group?: string;
}

export interface AssistantSearchResult {
  /** How many callable operations matched, BEFORE the result cap. */
  matched: number;
  /** Total callable operations in the catalog. */
  total: number;
  operations: AssistantOperationSummary[];
  /** True when `matched` exceeded the cap and the list was trimmed. */
  truncated: boolean;
}

/**
 * How many operations one search may return. The catalog runs to hundreds of
 * entries with paragraph-length descriptions, so an unbounded broad match would
 * spend more context than the answer is worth; the agent narrows with `group`
 * or a sharper query instead.
 */
export const ASSISTANT_SEARCH_LIMIT = 40;

const summarize = (op: AssistantOperation): AssistantOperationSummary => ({
  name: op.name,
  group: op.group,
  description: op.description,
  confirm: op.confirm,
});

/** Every group with a callable operation, largest first then alphabetical. */
export function groupCounts(catalog: AssistantCatalog): AssistantGroupCount[] {
  const counts = new Map<string, number>();
  for (const op of callableOperations(catalog)) {
    counts.set(op.group, (counts.get(op.group) ?? 0) + 1);
  }
  return [...counts]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group));
}

/**
 * Case-insensitive substring search over name, description, and group. An
 * absent query matches everything (so `group` alone lists that group); an
 * absent group matches every group.
 */
export function searchOperations(
  catalog: AssistantCatalog,
  input: AssistantSearchInput,
  limit: number = ASSISTANT_SEARCH_LIMIT,
): AssistantSearchResult {
  const callable = callableOperations(catalog);
  const query = input.query?.trim().toLowerCase() ?? "";
  const group = input.group?.trim().toLowerCase() ?? "";
  const matches = callable.filter((op) => {
    if (group && op.group.toLowerCase() !== group) return false;
    if (!query) return true;
    return (
      op.name.toLowerCase().includes(query) ||
      op.description.toLowerCase().includes(query) ||
      op.group.toLowerCase().includes(query)
    );
  });
  return {
    matched: matches.length,
    total: callable.length,
    operations: matches.slice(0, limit).map(summarize),
    truncated: matches.length > limit,
  };
}
