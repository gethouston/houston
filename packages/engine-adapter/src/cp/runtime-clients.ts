import { HoustonEngineClient } from "@houston/runtime-client";
import { type ControlPlaneConfig, gatewayAuthFetch } from "./fetch";
import { transientRetryFetch } from "./transient-retry";

export function runtimeClientFor(
  cfg: ControlPlaneConfig,
  agentId: string,
): HoustonEngineClient {
  return new HoustonEngineClient({
    baseUrl: `${cfg.baseUrl}/agents/${encodeURIComponent(agentId)}`,
    fetch: transientRetryFetch(
      gatewayAuthFetch(cfg.token, () => cfg.activeOrgSlug),
    ),
  });
}

export function setupRuntimeClientFor(
  cfg: ControlPlaneConfig,
): HoustonEngineClient {
  return new HoustonEngineClient({
    baseUrl: `${cfg.baseUrl}/setup-runtime`,
    fetch: transientRetryFetch(
      gatewayAuthFetch(cfg.token, () => cfg.activeOrgSlug),
    ),
  });
}
