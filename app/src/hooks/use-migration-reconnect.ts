import { MIGRATION_RECONNECT_DISMISSED_KEY } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { newEngineActive } from "../lib/engine";
import { queryKeys } from "../lib/query-keys";
import { tauriPreferences, tauriSystem } from "../lib/tauri";
import { shouldShowMigrationReconnect } from "./migration-reconnect-trigger";
import { useProviderStatuses } from "./use-provider-statuses";

export interface MigrationReconnectState {
  /** Render the reconnect screen now. */
  show: boolean;
  /**
   * Persist that the moment is done (a provider connected, or the user chose to
   * continue without one) so it never shows again. Idempotent.
   */
  dismiss: () => Promise<void>;
}

/**
 * Drives the post-migration "reconnect your AI" gate.
 *
 * Signals:
 * - `chatHistoryMigrated()` from the host's `/v1/version` — did this install
 *   come from the legacy desktop build (history migrated, credentials did not).
 * - `useProviderStatuses()` — is any provider already connected.
 * - a `migration_reconnect_dismissed` engine preference — the persisted "seen"
 *   flag, mirroring `useLegalAcceptance`, so it survives reinstall-in-place.
 *
 * The flag is written on a successful reconnect (or an explicit "continue"),
 * after which `dismissed` flips true and the gate never returns.
 */
export function useMigrationReconnect(): MigrationReconnectState {
  const qc = useQueryClient();

  const migratedQuery = useQuery({
    queryKey: queryKeys.migrationReconnect(),
    // The host's answer is stable for the life of the install; fetch once.
    queryFn: () => tauriSystem.chatHistoryMigrated(),
    staleTime: Number.POSITIVE_INFINITY,
  });

  const dismissedQuery = useQuery({
    queryKey: queryKeys.migrationReconnectDismissed(),
    queryFn: async (): Promise<boolean> => {
      const raw = await tauriPreferences.get(MIGRATION_RECONNECT_DISMISSED_KEY);
      return raw === "1";
    },
    staleTime: 30_000,
  });

  const { statuses, isLoading: statusesLoading } = useProviderStatuses();
  const hasProvider = Object.values(statuses).some((s) => s.authenticated);

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
    migrated: migratedQuery.data ?? false,
    hasProvider,
    dismissed: dismissedQuery.data ?? false,
    loading:
      migratedQuery.isLoading || dismissedQuery.isLoading || statusesLoading,
  });

  return { show, dismiss };
}
