import type { Capabilities } from "@houston/engine-adapter";
import { useQuery } from "@tanstack/react-query";
import { getEngine, newEngineActive } from "../lib/engine";
import i18n from "../lib/i18n";
import { queryKeys } from "../lib/query-keys";
import { useQueryErrorToast } from "./use-query-error-toast.ts";

export function useCapabilities(): {
  capabilities: Capabilities | null;
  isLoading: boolean;
  isError: boolean;
} {
  const enabled = newEngineActive();
  const query = useQuery({
    queryKey: queryKeys.capabilities(),
    queryFn: () => getEngine().capabilities(),
    enabled,
    staleTime: Infinity,
    retry: 3,
  });

  useQueryErrorToast(
    query.isError,
    query.error,
    "capabilities_fetch",
    i18n.t("shell:engineGate.loadFailed"),
  );

  return {
    capabilities: query.data ?? null,
    isLoading: enabled && query.isLoading,
    isError: enabled && query.isError,
  };
}
