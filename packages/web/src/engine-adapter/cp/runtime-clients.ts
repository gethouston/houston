import { HoustonEngineClient } from "@houston/runtime-client";
import {
  type ControlPlaneConfig,
  gatewayAuthFetch,
  transientRetryFetch,
} from "./fetch";

/**
 * A runtime client scoped to ONE agent, via the control plane's transparent proxy.
 * Its `/conversations/:id/*` calls land on `${baseUrl}/agents/${agentId}/conversations/:id/*`.
 */
export function runtimeClientFor(
  cfg: ControlPlaneConfig,
  agentId: string,
): HoustonEngineClient {
  // Auth rides gatewayAuthFetch, never a pinned token: these clients back
  // long-lived turn streams, whose reconnects must present the CURRENT bearer
  // (and refresh it on 401) or a gateway roll kills the turn (HOU-687).
  // Reads additionally bridge transient gateway 5xx (rolling deploy, pod
  // handoff) like every cpFetch read does — without it a history load hit
  // mid-roll threw once and the chat rendered empty until reselected (HOU-731).
  return new HoustonEngineClient({
    baseUrl: `${cfg.baseUrl}/agents/${encodeURIComponent(agentId)}`,
    fetch: transientRetryFetch(
      gatewayAuthFetch(cfg.token, () => cfg.activeOrgSlug),
    ),
  });
}

/**
 * Runtime client for the host's hidden SETUP runtime (`/setup-runtime/*`):
 * the pre-agent provider-connect surface first-run onboarding uses. Provider
 * OAuth needs a runtime to execute in, but the flow connects the AI BEFORE the
 * first agent exists — the host runs it in a dedicated hidden runtime whose
 * captured credential lands on the personal workspace, so the agent created
 * right after is already connected.
 */
export function setupRuntimeClientFor(
  cfg: ControlPlaneConfig,
): HoustonEngineClient {
  return new HoustonEngineClient({
    baseUrl: `${cfg.baseUrl}/setup-runtime`,
    fetch: gatewayAuthFetch(cfg.token, () => cfg.activeOrgSlug),
  });
}
