import { useIntegrationStatus } from "../../hooks/queries";
import { activeIntegration, INTEGRATION_PROVIDER } from "./model";

/**
 * The provider id every single-provider integrations surface should manage —
 * the platform provider when wired, else the first MCP app hub. Falls back to
 * the platform id while status loads (harmless: queries downstream are gated
 * on readiness anyway), so cloud and hub-only local render one identical UI.
 */
export function useActiveIntegration(): {
  providerId: string;
  ready: boolean;
  reconnect: boolean;
} {
  const status = useIntegrationStatus();
  const item = activeIntegration(status.data);
  return {
    providerId: item?.provider ?? INTEGRATION_PROVIDER,
    ready: !!item?.ready,
    reconnect: !!(item as { reconnect?: boolean } | undefined)?.reconnect,
  };
}
