import type { IntegrationToolkit } from "@houston/engine-adapter";
import { useMemo } from "react";
import {
  useIntegrationStatus,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { INTEGRATION_PROVIDER } from "./model";

export function useIntegrationProviderReady(): boolean {
  const status = useIntegrationStatus();
  return !!status.data?.find((p) => p.provider === INTEGRATION_PROVIDER)?.ready;
}

export function useReadyToolkitCatalog() {
  return useIntegrationToolkits(
    INTEGRATION_PROVIDER,
    useIntegrationProviderReady(),
  );
}

export function useToolkitBySlug(): Map<string, IntegrationToolkit> {
  const catalog = useReadyToolkitCatalog();
  return useMemo(
    () => new Map((catalog.data ?? []).map((tk) => [tk.slug, tk])),
    [catalog.data],
  );
}
