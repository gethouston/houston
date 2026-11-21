import { MIGRATION_RECONNECT_DISMISSED_KEY } from "@houston/engine-adapter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { isCoLocatedEngine, newEngineActive } from "../lib/engine";
import { queryKeys } from "../lib/query-keys";
import { tauriPreferences, tauriSystem } from "../lib/tauri";
import {
  migrationProviderSignals,
  shouldShowMigrationReconnect,
} from "./migration-reconnect-trigger";
import { useProviderStatuses } from "./use-provider-statuses";

export interface MigrationReconnectState {
  show: boolean;
  dismiss: () => Promise<void>;
}

export function useMigrationReconnect(): MigrationReconnectState {
  const qc = useQueryClient();

  const coLocated = isCoLocatedEngine();

  const migratedQuery = useQuery({
    queryKey: queryKeys.migrationReconnect(),
    queryFn: () => tauriSystem.chatHistoryMigrated(),
    staleTime: Number.POSITIVE_INFINITY,
    enabled: coLocated,
  });

  const dismissedQuery = useQuery({
    queryKey: queryKeys.migrationReconnectDismissed(),
    queryFn: async (): Promise<boolean> => {
      const raw = await tauriPreferences.get(MIGRATION_RECONNECT_DISMISSED_KEY);
      return raw === "1";
    },
    staleTime: 30_000,
  });

  const {
    statuses,
    isLoading: statusesLoading,
    isError: statusesError,
  } = useProviderStatuses();
  const { hasProvider, unconfirmable } = migrationProviderSignals(
    Object.values(statuses),
  );

  const dismissMutation = useMutation({
    mutationFn: async () => {
      await tauriPreferences.set(MIGRATION_RECONNECT_DISMISSED_KEY, "1");
    },
    onSuccess: () => {
      qc.setQueryData(queryKeys.migrationReconnectDismissed(), true);
    },
  });

  const dismiss = useCallback(async () => {
    await dismissMutation.mutateAsync();
  }, [dismissMutation]);

  const show = shouldShowMigrationReconnect({
    newEngine: newEngineActive(),
    coLocated,
    migrated: migratedQuery.data ?? false,
    hasProvider,
    dismissed: dismissedQuery.data ?? false,
    loading:
      (coLocated && migratedQuery.isLoading) ||
      dismissedQuery.isLoading ||
      statusesLoading ||
      statusesError ||
      unconfirmable,
  });

  return { show, dismiss };
}
