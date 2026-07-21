import type {
  CreatorProfile,
  StoreCatalogAgent,
} from "@houston-ai/engine-client";
import { useEffect, useState } from "react";
import { useCreatorProfile } from "../../../hooks/use-creator-profile";

/** Merge a freshly loaded page into the running list, de-duping by agent id. */
function mergeById(
  prev: StoreCatalogAgent[],
  next: StoreCatalogAgent[],
): StoreCatalogAgent[] {
  const seen = new Set(prev.map((a) => a.id));
  return [...prev, ...next.filter((a) => !seen.has(a.id))];
}

export interface CreatorAgentsResult {
  profile: CreatorProfile | undefined;
  items: StoreCatalogAgent[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  hasMore: boolean;
  isFetchingMore: boolean;
  showMore: () => void;
  retry: () => void;
}

/**
 * A creator's profile plus their public listings accumulated across pages. The
 * shared {@link useCreatorProfile} query keys each page independently (so paging
 * caches), so this hook stitches successive pages into one growing list for the
 * catalog grid. Resets to the first page whenever the handle changes.
 */
export function useCreatorAgents(handle: string | null): CreatorAgentsResult {
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<StoreCatalogAgent[]>([]);
  const query = useCreatorProfile(handle, { page });

  // A new handle is a new creator: drop the accumulated list and page back to 1
  // before its first page loads, so no previous creator's agents flash through.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset is keyed on the handle alone.
  useEffect(() => {
    setPage(1);
    setItems([]);
  }, [handle]);

  useEffect(() => {
    const loaded = query.data?.agents.items;
    if (!loaded) return;
    setItems((prev) => (page === 1 ? loaded : mergeById(prev, loaded)));
  }, [query.data, page]);

  return {
    profile: query.data?.profile,
    items,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    hasMore: query.data?.agents.hasMore ?? false,
    isFetchingMore: query.isFetching && page > 1,
    showMore: () => setPage((p) => p + 1),
    retry: () => {
      void query.refetch();
    },
  };
}
