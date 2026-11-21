import type {
  AssistantCatalog,
  AssistantOperation,
} from "@houston/host/src/assistant/catalog";
import { callableOperations } from "./assistant-callable";

export interface AssistantGroupCount {
  group: string;
  count: number;
}

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
  matched: number;
  total: number;
  operations: AssistantOperationSummary[];
  truncated: boolean;
}

export const ASSISTANT_SEARCH_LIMIT = 40;

const summarize = (op: AssistantOperation): AssistantOperationSummary => ({
  name: op.name,
  group: op.group,
  description: op.description,
  confirm: op.confirm,
});

export function groupCounts(catalog: AssistantCatalog): AssistantGroupCount[] {
  const counts = new Map<string, number>();
  for (const op of callableOperations(catalog)) {
    counts.set(op.group, (counts.get(op.group) ?? 0) + 1);
  }
  return [...counts]
    .map(([group, count]) => ({ group, count }))
    .sort((a, b) => b.count - a.count || a.group.localeCompare(b.group));
}

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
