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

import { type ControlPlaneConfig, liveToken } from "./control-plane";
import { refreshLiveToken } from "./session-refresh";

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
  "https://store.gethouston.ai"
).replace(/\/+$/, "");

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** The gateway base for the `/v1/agentstore/*` routes. */
export function storeApiBase(cfg: ControlPlaneConfig): string {
  const installed =
    typeof window !== "undefined" ? window.__HOUSTON_STORE__?.baseUrl : "";
  return trimSlash(installed || cfg.baseUrl);
}

/** The live store bearer: the shell-installed session token, else the live
 *  engine token (hosted mode, where it already IS the user's session token). */
function liveStoreToken(fallback: string): string {
  const installed =
    typeof window !== "undefined" ? window.__HOUSTON_STORE__?.token : "";
  return installed || liveToken(fallback);
}

/**
 * A `fetch` for the store gateway API: the bearer is read LIVE per attempt, and
 * a 401 triggers one session refresh + replay (mirrors `gatewayAuthFetch`, but
 * with the store bearer and no org header). A 401 that survives the refresh
 * returns as-is so a real sign-out surfaces.
 */
export function storeAuthFetch(fallbackToken: string): typeof fetch {
  return async (input, init) => {
    const send = (bearer: string) => {
      const headers = new Headers(init?.headers);
      if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
      return fetch(input, { ...init, headers });
    };
    const res = await send(liveStoreToken(fallbackToken));
    if (res.status !== 401) return res;
    const fresh = await refreshLiveToken();
    if (!fresh) return res;
    return send(fresh);
  };
}
