import type { ApiKey } from "@houston-ai/engine-client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiKeysSupported } from "../../lib/api-keys-model";
import { queryKeys } from "../../lib/query-keys";
import { tauriApiKeys } from "../../lib/tauri";
import { useCapabilities } from "../use-capabilities";

/**
 * C9 personal API-key hooks (`GET/POST/DELETE /v1/keys`). Hosted-gateway only:
 * every hook self-gates on `capabilities.apiKeys`, so off-cloud (desktop,
 * self-host) the query never fires and the section never renders.
 *
 * The wire calls route through `tauriApiKeys.*` → the engine client's `call()`
 * wrapper, which surfaces any failure once as a red bug toast + Sentry report
 * (the required no-silent-failures path). So these hooks carry no `onError` — a
 * second toast would double up (same as `use-billing.ts`). The one exception is
 * the mint's `key_limit`, which `tauriApiKeys.create` silences so the section
 * can render it inline; the mutation error is read by the caller for that.
 */

/** The caller's active API keys, newest first. Enabled only on a gateway that
 *  serves the public API. */
export function useApiKeys() {
  const { capabilities } = useCapabilities();
  return useQuery<ApiKey[]>({
    queryKey: queryKeys.apiKeys(),
    queryFn: () => tauriApiKeys.list(),
    enabled: apiKeysSupported(capabilities),
    staleTime: 30_000,
  });
}

/**
 * Mint a personal API key. On success the full secret is returned to the caller
 * (for the one-time reveal) and the list is invalidated so the new key appears;
 * the secret is deliberately NOT written into any cache. A `key_limit` rejection
 * is surfaced inline by the caller (see the hook-file doc), not toasted.
 */
export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => tauriApiKeys.create(name.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.apiKeys() });
    },
  });
}

/** Revoke a key by id, then refresh the list. */
export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => tauriApiKeys.revoke(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.apiKeys() });
    },
  });
}
