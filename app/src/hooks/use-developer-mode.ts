import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { tauriPreferences } from "../lib/tauri";

/**
 * Developer mode — the master "advanced" toggle. Off by default, so the
 * non-technical product is unchanged. When on, technical surfaces (files,
 * folders, git history, the workspace-root location, …) become visible.
 *
 * Persisted as the engine preference `developer_mode` (string `"true"`/
 * `"false"`), the same KV channel `theme` / `locale` use.
 */
const DEVELOPER_MODE_KEY = "developer_mode";
const queryKey = ["preference", DEVELOPER_MODE_KEY] as const;

export interface DeveloperModeState {
  enabled: boolean;
  isLoading: boolean;
  setEnabled: (enabled: boolean) => Promise<boolean>;
}

export function useDeveloperMode(): DeveloperModeState {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey,
    queryFn: async () => (await tauriPreferences.get(DEVELOPER_MODE_KEY)) === "true",
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      await tauriPreferences.set(DEVELOPER_MODE_KEY, enabled ? "true" : "false");
      return enabled;
    },
    onSuccess: (enabled) => qc.setQueryData(queryKey, enabled),
  });

  return {
    enabled: query.data ?? false,
    isLoading: query.isLoading,
    setEnabled: (enabled: boolean) => mutation.mutateAsync(enabled),
  };
}
