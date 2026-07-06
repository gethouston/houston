import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  DEFAULT_MAX_RECENTS,
  getFavorites,
  getRecents,
  pushRecent as pushRecentPref,
  toggleFavorite as toggleFavoritePref,
} from "../lib/model-favorites";

// Local query keys (app-scoped, not agent-scoped) — mirrors use-locale-preference.ts,
// which keeps its own preference keys rather than adding to the shared factory.
const favoritesKey = ["model-favorites"] as const;
const recentsKey = ["model-recents"] as const;

export interface ModelFavoritesState {
  /** Favorited model ids. Empty until the first fetch resolves. */
  favorites: string[];
  /** Recently-used model ids, newest first. Empty until the first fetch resolves. */
  recents: string[];
  /** Toggle a model's favorite membership and persist it. */
  toggleFavorite: (id: string) => Promise<void>;
  /** Record a model as most-recently-used and persist it. */
  pushRecent: (id: string, max?: number) => Promise<void>;
  /** True only on the first load with no cached data. */
  isLoading: boolean;
}

/**
 * Reactive access to the user's persisted favorite + recent model ids.
 *
 * Both lists are engine-owned preferences (see `lib/model-favorites.ts`), cached
 * and reactive via TanStack Query. Mutations write the authoritative new list
 * returned by the data layer straight into the cache (`setQueryData`) — like
 * `use-locale-preference.ts` — so a toggle reflects instantly with no refetch.
 *
 * Concurrency: each mutation reads its base from the live query CACHE (not the
 * persisted store) and is pinned to a serialized `scope`, so TanStack runs
 * same-scope mutations one at a time. Two rapid toggles therefore stack — the
 * second reads the first's already-committed result instead of the same stale
 * base — closing the lost-update race a read-modify-write against preferences
 * would open. A never-loaded cache (undefined) falls back to a fresh read.
 *
 * The mutations carry no `onError`: their `mutationFn` routes through
 * `tauriPreferences.get/set`, each wrapped by the `call()` adapter in
 * `lib/tauri.ts`, which already surfaces the real error as a red toast and
 * reports it to Sentry before re-throwing. Adding an `onError` would
 * double-toast.
 */
export function useModelFavorites(): ModelFavoritesState {
  const qc = useQueryClient();

  const favoritesQuery = useQuery({
    queryKey: favoritesKey,
    queryFn: getFavorites,
    staleTime: 30_000,
  });
  const recentsQuery = useQuery({
    queryKey: recentsKey,
    queryFn: getRecents,
    staleTime: 30_000,
  });

  const toggleMutation = useMutation({
    scope: { id: "model-favorites" },
    mutationFn: async (id: string) => {
      const base =
        qc.getQueryData<string[]>(favoritesKey) ?? (await getFavorites());
      return toggleFavoritePref(base, id);
    },
    onSuccess: (next) => qc.setQueryData<string[]>(favoritesKey, next),
  });
  const pushMutation = useMutation({
    scope: { id: "model-recents" },
    mutationFn: async ({ id, max }: { id: string; max: number }) => {
      const base =
        qc.getQueryData<string[]>(recentsKey) ?? (await getRecents());
      return pushRecentPref(base, id, max);
    },
    onSuccess: (next) => qc.setQueryData<string[]>(recentsKey, next),
  });

  const toggleFavorite = useCallback(
    async (id: string) => {
      await toggleMutation.mutateAsync(id);
    },
    [toggleMutation],
  );

  const pushRecent = useCallback(
    async (id: string, max = DEFAULT_MAX_RECENTS) => {
      await pushMutation.mutateAsync({ id, max });
    },
    [pushMutation],
  );

  return {
    favorites: favoritesQuery.data ?? [],
    recents: recentsQuery.data ?? [],
    toggleFavorite,
    pushRecent,
    isLoading: favoritesQuery.isLoading || recentsQuery.isLoading,
  };
}
