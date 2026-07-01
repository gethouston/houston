import type { Capabilities } from "@houston-ai/engine-client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { getEngine, newEngineActive } from "../lib/engine";
import { showErrorToast } from "../lib/error-toast";
import i18n from "../lib/i18n";
import { queryKeys } from "../lib/query-keys";

/**
 * Returns host-advertised deployment capabilities for new-engine builds.
 *
 * Provider UIs gate on these flags, so a failed fetch would otherwise leave the
 * model picker silently empty (the placeholder denies every provider until the
 * real set loads). We surface the failure as a toast + Sentry report instead of
 * swallowing it — a noisy beta is a productive beta (see the no-silent-failures
 * rule). The query retries a few times first so a transient blip stays quiet.
 */
export function useCapabilities(): {
  capabilities: Capabilities | null;
  isLoading: boolean;
} {
  const enabled = newEngineActive();
  const query = useQuery({
    queryKey: queryKeys.capabilities(),
    queryFn: () => getEngine().capabilities(),
    enabled,
    staleTime: Infinity,
    retry: 3,
  });

  const reportedError = useRef<unknown>(null);
  useEffect(() => {
    if (!query.isError) {
      reportedError.current = null;
      return;
    }
    // Toast once per distinct error so a background refetch loop can't spam.
    if (reportedError.current === query.error) return;
    reportedError.current = query.error;
    showErrorToast(
      "capabilities_fetch",
      i18n.t("shell:engineGate.loadFailed"),
      query.error,
    );
  }, [query.isError, query.error]);

  return {
    capabilities: query.data ?? null,
    isLoading: enabled && query.isLoading,
  };
}
