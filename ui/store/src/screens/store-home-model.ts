import type { CatalogSort, CatalogView } from "../components/catalog-controls";
import type {
  CreatorDirectoryRow,
  StoreAgentRow,
  StoreCategoryRow,
} from "../types";

export interface StoreHomeState {
  query: string;
  category?: string;
  view: CatalogView;
  sort: CatalogSort;
}

export interface StoreHomeRows {
  agents: StoreAgentRow[];
  creators: CreatorDirectoryRow[];
  categories: StoreCategoryRow[];
}

function includesQuery(
  values: Array<string | null | undefined>,
  query: string,
) {
  const needle = query.trim().toLocaleLowerCase();
  return (
    !needle ||
    values.some((value) => value?.toLocaleLowerCase().includes(needle))
  );
}

export function filterStoreAgents(
  agents: StoreAgentRow[],
  state: StoreHomeState,
) {
  const matches = agents.filter(
    (agent) =>
      (!state.category || agent.category === state.category) &&
      includesQuery(
        [
          agent.name,
          agent.tagline,
          agent.description,
          agent.creator.displayName,
          agent.creator.handle,
          ...(agent.tags ?? []),
        ],
        state.query,
      ),
  );
  return matches.toSorted((a, b) =>
    state.sort === "alphabetical"
      ? a.name.localeCompare(b.name)
      : b.installsCount - a.installsCount,
  );
}

export function filterStoreCreators(
  creators: CreatorDirectoryRow[],
  query: string,
) {
  return creators.filter((creator) =>
    includesQuery([creator.displayName, creator.handle, creator.bio], query),
  );
}
