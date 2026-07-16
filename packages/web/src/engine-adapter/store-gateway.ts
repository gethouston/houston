/**
 * The gateway seam for the Agent Store publish flow.
 *
 * Publishing is account-based: the app POSTs the agent's IR to the gateway
 * `/v1/agentstore` API with the user's OWN bearer (a GCIP/Supabase id token) —
 * there are no manage tokens. This reuses the same live-bearer + 401-refresh
 * discipline as the engine transport (`gatewayAuthFetch`), and the store routes
 * are user-scoped (org-agnostic), so no `x-houston-org` header is sent.
 *
 * The store target differs by deployment:
 *   - hosted / web: the engine IS the gateway, so `cfg.baseUrl` + the live
 *     engine bearer (already the user's session token) are correct.
 *   - desktop with a LOCAL sidecar: the engine is `127.0.0.1`, so the shell
 *     installs `window.__HOUSTON_STORE__` with the public gateway URL and the
 *     current session token (see app/src/lib/auth-gateway.ts).
 */

import { type ControlPlaneConfig, gatewayAuthFetch } from "./control-plane";

declare global {
  interface Window {
    /**
     * Store gateway target installed by the desktop shell when the engine is a
     * local sidecar (the gateway is elsewhere). Absent on hosted/web, where the
     * engine baseUrl + bearer already point at the gateway.
     */
    __HOUSTON_STORE__?: { baseUrl: string; token: string };
  }
}

/** The public store SITE (not API) base, for "browse the store" links. */
export const STORE_SITE_URL = (
  (import.meta.env?.VITE_AGENTSTORE_SITE_URL as string | undefined) ??
  "https://agents.gethouston.ai"
).replace(/\/+$/, "");

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** The gateway base for the `/v1/agentstore/*` routes. */
export function storeApiBase(cfg: ControlPlaneConfig): string {
  const installed =
    typeof window !== "undefined" ? window.__HOUSTON_STORE__?.baseUrl : "";
  return trimSlash(installed || cfg.baseUrl);
}

/**
 * A `fetch` for the store gateway API, built on the engine transport's
 * {@link gatewayAuthFetch} (live bearer per attempt + one 401 refresh/replay,
 * HOU-687) with NO `x-houston-org` header — the store routes are user-scoped.
 *
 * The bearer must be the user's SESSION token. In hosted mode `gatewayAuthFetch`
 * reads it live off `window.__HOUSTON_ENGINE__` (already the session). In
 * local-sidecar mode the engine global holds the LOCAL host token, not the
 * session, so the shell-installed `window.__HOUSTON_STORE__.token` (the session)
 * is passed as the fallback `gatewayAuthFetch` falls back to when no engine
 * global is present.
 */
export function storeAuthFetch(fallbackToken: string): typeof fetch {
  const installed =
    typeof window !== "undefined" ? window.__HOUSTON_STORE__?.token : "";
  return gatewayAuthFetch(installed || fallbackToken);
}
