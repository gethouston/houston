import {
  noteBearerAccepted,
  noteBearerRejected,
  refreshGatewayBearer,
  settleRejectedMint,
  wasBearerRejected,
} from "./gateway-refresh.ts";

export interface GatewayRequestInit extends RequestInit {
  orgScoped?: boolean;
}

export interface GatewayFetchDeps {
  baseUrl: string;
  token: () => string | undefined;
  refresh: () => Promise<string | null>;
  fetchFn: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  org?: () => string | null | undefined;
  appVersion?: () => string | null;
}

function installedAppVersion(): string | null {
  if (typeof window === "undefined") return null;
  return window.__HOUSTON_APP_VERSION__ ?? null;
}

function installedActiveOrg(): string | null {
  if (typeof window === "undefined") return null;
  return window.__HOUSTON_ACTIVE_ORG__ ?? null;
}

export async function gatewayFetch(
  deps: GatewayFetchDeps,
  path: string,
  init?: GatewayRequestInit,
): Promise<Response | null> {
  const { orgScoped = true, ...request } = init ?? {};
  const url = `${deps.baseUrl.replace(/\/+$/, "")}${path}`;
  const send = (bearer: string) => {
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${bearer}`);
    const org = orgScoped ? (deps.org ?? installedActiveOrg)() : null;
    if (org) headers.set("x-houston-org", org);
    const version = (deps.appVersion ?? installedAppVersion)();
    if (version) headers.set("X-Houston-App-Version", version);
    return deps.fetchFn(url, { ...request, headers });
  };
  const bearer =
    deps.token() || (await refreshGatewayBearer(() => deps.refresh()));
  if (!bearer) return null;
  const res = await send(bearer);
  if (res.status !== 401) {
    noteBearerAccepted(bearer);
    return res;
  }
  noteBearerRejected(bearer);
  const fresh = await refreshGatewayBearer(() => deps.refresh());
  if (!fresh || fresh === bearer || wasBearerRejected(fresh)) return res;
  const replay = await send(fresh);
  if (replay.status !== 401) {
    noteBearerAccepted(fresh);
    return replay;
  }
  noteBearerRejected(fresh);
  return settleRejectedMint({
    replay,
    bearer: fresh,
    send,
    quiet: () => res,
    sleep: deps.sleep ?? realSleep,
  });
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function liveGatewayDeps(): GatewayFetchDeps | null {
  const cfg = typeof window !== "undefined" ? window.__HOUSTON_ENGINE__ : null;
  if (!cfg?.baseUrl) return null;
  return {
    baseUrl: cfg.baseUrl,
    token: () => window.__HOUSTON_ENGINE__?.token || undefined,
    refresh: async () => (await window.__HOUSTON_SESSION_REFRESH__?.()) ?? null,
    fetchFn: (input, init) => fetch(input, init),
  };
}
