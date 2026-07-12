import { useEffect } from "react";
import { useSession } from "../hooks/use-session";
import { isRemoteEngine } from "./engine";

/**
 * Points the Agent Store adapter at the public gateway with the user's OWN
 * session token (the Firebase ID token) when the engine is a LOCAL sidecar.
 *
 * Publishing is account-based: the app POSTs the agent's IR to the gateway
 * `/v1/agentstore` API with this bearer, there are no manage tokens. In
 * gateway-fronted modes (hosted, or a dev host URL) the engine base + bearer
 * already point at the gateway (the engine global holds the session token and
 * the 401 refresher is installed by the shell), so the adapter uses those and
 * this is a no-op. Only the Tauri-spawned local sidecar needs a separate
 * gateway target, because its engine is `127.0.0.1` and its engine bearer is
 * the local host token, not the session.
 */

const STORE_GATEWAY_URL = (
  (import.meta.env?.VITE_AGENTSTORE_GATEWAY_URL as string | undefined) ??
  "https://gateway.gethouston.ai"
).replace(/\/+$/, "");

declare global {
  interface Window {
    __HOUSTON_STORE__?: { baseUrl: string; token: string };
  }
}

/** Install (or clear on sign-out) the store gateway target + current bearer. */
function setStoreGatewaySession(token: string | null): void {
  if (typeof window === "undefined") return;
  if (!token) {
    delete window.__HOUSTON_STORE__;
    return;
  }
  window.__HOUSTON_STORE__ = { baseUrl: STORE_GATEWAY_URL, token };
}

/**
 * Keeps the store gateway supplied with the user's current session token in
 * local-sidecar mode. Mounted once in `<App/>`. No-op in gateway-fronted modes.
 * The token stays fresh on its own: the identity proactive-refresh timer keeps
 * `useSession` current, so a rotation re-runs this effect with the new bearer.
 */
export function useStoreGatewaySession(): void {
  const { data: session } = useSession();
  const token = session?.idToken ?? null;

  useEffect(() => {
    if (isRemoteEngine()) return;
    setStoreGatewaySession(token);
    return () => setStoreGatewaySession(null);
  }, [token]);
}
