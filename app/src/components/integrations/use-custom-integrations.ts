import type {
  IntegrationConnection,
  IntegrationToolkit,
} from "@houston-ai/engine-client";
import { useMemo } from "react";
import {
  useIntegrationConnections,
  useIntegrationToolkits,
} from "../../hooks/queries";
import { CUSTOM_INTEGRATION_PROVIDER } from "../../hooks/queries/custom-integration-keys";
import { useCapabilities } from "../../hooks/use-capabilities";
import { customIntegrationsSupported, customSlugSet } from "./capabilities";

export interface CustomIntegrationsData {
  /** The caller's custom integrations as connections (one active per slug). */
  connections: IntegrationConnection[];
  /** The same integrations as toolkits, so `appDisplay` resolves name + logo. */
  toolkits: IntegrationToolkit[];
  /**
   * Slugs of the caller's custom integrations. For custom the slug IS both the
   * `toolkit` and the `connectionId`, so a single set answers "is this row / this
   * connection custom?" by either key — used to route the detail sheet, the
   * disconnect provider, and the "add another account" suppression.
   */
  slugs: Set<string>;
  /** This deployment serves the custom provider (drives the "add" CTA). */
  supported: boolean;
  isLoading: boolean;
}

/**
 * The caller's custom API-key integrations, fetched only when the host advertises
 * the `"custom"` provider (else every field is empty and `supported` is false, so
 * both surfaces render exactly as before). Shared by the global page and the
 * agent tab so the merge + routing logic lives in one place. `enabled` lets a
 * surface hold the fetch behind its own boot gate.
 */
export function useCustomIntegrations(
  enabled: boolean,
): CustomIntegrationsData {
  const { capabilities } = useCapabilities();
  const supported = customIntegrationsSupported(capabilities);
  const on = enabled && supported;
  const connections = useIntegrationConnections(
    CUSTOM_INTEGRATION_PROVIDER,
    on,
  );
  const toolkits = useIntegrationToolkits(CUSTOM_INTEGRATION_PROVIDER, on);

  const conns = connections.data ?? [];
  const slugs = useMemo(() => customSlugSet(conns), [conns]);

  return {
    connections: conns,
    toolkits: toolkits.data ?? [],
    slugs,
    supported,
    isLoading: on && (connections.isLoading || toolkits.isLoading),
  };
}
