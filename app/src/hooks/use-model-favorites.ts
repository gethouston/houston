import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  DEFAULT_MAX_RECENTS,
  getFavorites,
  getRecents,
  pushRecent as pushRecentPref,
  toggleFavorite as toggleFavoritePref,
} from "../lib/model-favorites";

const favoritesKey = ["model-favorites"] as const;
const recentsKey = ["model-recents"] as const;

export interface ModelFavoritesState {
  favorites: string[];
  recents: string[];
  toggleFavorite: (id: string) => Promise<void>;
  pushRecent: (id: string, max?: number) => Promise<void>;
  isLoading: boolean;
}

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
