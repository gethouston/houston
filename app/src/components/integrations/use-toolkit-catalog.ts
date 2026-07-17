import type { IntegrationToolkit } from "@houston-ai/engine-client";
import { useMemo } from "react";
import {
  useIntegrationStatus,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { INTEGRATION_PROVIDER } from "./model";

/**
 * The integration provider's toolkit catalog, gated on the provider being
 * READY (the Houston session push has landed). The single home for the
 * readiness predicate every read-only display surface used to repeat inline:
 * the catalog is fetched only once the status query reports the provider
 * `ready`, so a still-warming gateway never fires a failing toolkits call.
 */
export function useReadyToolkitCatalog() {
  const status = useIntegrationStatus();
  const ready = !!status.data?.find((p) => p.provider === INTEGRATION_PROVIDER)
    ?.ready;
  return useIntegrationToolkits(INTEGRATION_PROVIDER, ready);
}

/**
 * The ready toolkit catalog indexed by slug — the one source for turning a
 * machine slug into its display identity through {@link appDisplay}. Memoized
 * on the catalog data so consumers get a stable map across renders.
 */
export function useToolkitBySlug(): Map<string, IntegrationToolkit> {
  const catalog = useReadyToolkitCatalog();
  return useMemo(
    () => new Map((catalog.data ?? []).map((tk) => [tk.slug, tk])),
    [catalog.data],
  );
}
