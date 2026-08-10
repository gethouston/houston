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

/**
 * The unfiltered agents view leads with a featured pair above the full grid.
 * The catalog carries no curation flag, so "featured" is what the numbers
 * already say: the two most-installed agents, and only when two have installs
 * to show — one featured card in a two-wide row reads as a gap, not a
 * feature. Any query, category, or the creators view collapses back to the
 * plain grid, and the grid never repeats what the featured row already shows.
 * Hosts opt in via {@link StoreHomeScreenProps.featured}; this split is only
 * honest over the full catalog, never over one server page of it.
 */
export function splitFeaturedAgents(
  agents: StoreAgentRow[],
  state: StoreHomeState,
): { featured: StoreAgentRow[]; rest: StoreAgentRow[] } {
  const all = filterStoreAgents(agents, state);
  if (state.query || state.category || state.view !== "agents")
    return { featured: [], rest: all };
  const featured = all
    .toSorted((a, b) => b.installsCount - a.installsCount)
    .slice(0, 2)
    .filter((agent) => agent.installsCount > 0);
  if (featured.length < 2) return { featured: [], rest: all };
  const featuredIds = new Set(featured.map((agent) => agent.id));
  return {
    featured,
    rest: all.filter((agent) => !featuredIds.has(agent.id)),
  };
}

export function filterStoreCreators(
  creators: CreatorDirectoryRow[],
  query: string,
) {
  return creators.filter((creator) =>
    includesQuery([creator.displayName, creator.handle, creator.bio], query),
  );
}
