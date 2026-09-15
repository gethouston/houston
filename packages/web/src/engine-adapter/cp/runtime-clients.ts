import { HoustonEngineClient } from "@houston/runtime-client";
import { type ControlPlaneConfig, gatewayAuthFetch } from "./fetch";
import { transientRetryFetch } from "./transient-retry";

/**
 * A runtime client scoped to ONE agent, via the control plane's transparent
 * proxy. Its calls land on `${baseUrl}/agents/${agentId}/…` — the provider,
 * auth and agent-document routes the runtime serves off that agent's pod.
 *
 * The CONVERSATION half of the same shape is `sdk.clientFor(agentId)`, built
 * identically inside `@houston/sdk` (same base, same auth fetch, same read
 * retry); chat binds that one so the turn machinery and the client it drives
 * come from the same place.
 */
export function runtimeClientFor(
  cfg: ControlPlaneConfig,
  agentId: string,
): HoustonEngineClient {
  // Auth rides gatewayAuthFetch, never a pinned token: hosted rotates the
  // bearer mid-session, so every call must present the CURRENT one (and refresh
  // it on 401) or a gateway roll fails it (HOU-687). Reads additionally bridge
  // transient gateway 5xx (rolling deploy, pod handoff) like every cpFetch read
  // does — a probe that meets a pod mid-handoff retries instead of surfacing a
  // hard failure (HOU-731).
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
 *
 * Reads ride the SAME transient-retry wrapper the per-agent client uses. This
 * runtime is cold BY DEFINITION — first-run reaches it before anything has ever
 * run — and the host now answers its probe routes (`/providers`,
 * `/providers/usage`, `/auth/status`) with 503 + `Retry-After` while it boots
 * (HOU-1153). Without the wrapper first-run setup took that 503 as a real
 * failure, while an agent probe one route over quietly retried and succeeded.
 */
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
