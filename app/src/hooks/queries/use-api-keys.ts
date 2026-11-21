import type { ApiKey } from "@houston/engine-adapter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { apiKeysWithout } from "../../lib/account-cache-patches";
import { apiKeysSupported } from "../../lib/api-keys-model";
import { optimisticWrite } from "../../lib/optimistic-write";
import { queryKeys } from "../../lib/query-keys";
import { tauriApiKeys } from "../../lib/tauri";
import { useCapabilities } from "../use-capabilities";

export function useApiKeys() {
  const { capabilities } = useCapabilities();
  return useQuery<ApiKey[]>({
    queryKey: queryKeys.apiKeys(),
    queryFn: () => tauriApiKeys.list(),
    enabled: apiKeysSupported(capabilities),
    staleTime: 30_000,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => tauriApiKeys.create(name.trim()),
    gcTime: 0,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.apiKeys() });
    },
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  const { t } = useTranslation("settings");
  return useCallback(
    (id: string) =>
      void optimisticWrite({
        qc,
        command: "revoke_api_key",
        patches: [
          {
            queryKey: queryKeys.apiKeys(),
            apply: (keys: ApiKey[] | undefined) => apiKeysWithout(keys, id),
          },
        ],
        write: () => tauriApiKeys.revoke(id),
        failure: {
          title: t("writeFailed.revokeApiKey.title"),
          description: t("writeFailed.revokeApiKey.description"),
        },
      }),
    [qc, t],
  );
}
