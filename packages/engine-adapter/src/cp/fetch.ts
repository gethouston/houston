import { refusesAuthReplay } from "@houston/sdk/auth-replay";
import { retryAfterMsOf } from "@houston/wire-types";
import { appVersionHeader } from "../app-version";
import { HoustonEngineError } from "../client/errors";
import { refreshLiveToken } from "../session-refresh";
import { wakingStuckTracker } from "../waking-stuck-tracker";
import {
  inControlPlaneMode,
  settleGatewayResponse,
  settleWithoutReplay,
  signedOutResponse,
} from "./bearer-recovery";
import { transientRetryFetch } from "./transient-retry";

export interface ControlPlaneConfig {
  baseUrl: string;
  token: string;
  activeOrgSlug?: string | null;
}

export const agentPath = (id: string) => `/agents/${encodeURIComponent(id)}`;

export function agentIdOfPath(path: string): string | null {
  const match = /^\/agents\/([^/?#]+)/.exec(path);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function liveToken(fallback: string): string {
  if (typeof window !== "undefined" && window.__HOUSTON_ENGINE__) {
    return window.__HOUSTON_ENGINE__.token;
  }
  return fallback;
}

export function gatewayAuthFetch(
  fallbackToken: string,
  getOrg?: () => string | null | undefined,
  getToken?: () => string,
  guard?: (bearer: string) => void,
): typeof fetch {
  return async (input, init) => {
    const send = (bearer: string) => {
      guard?.(bearer);
      const headers = new Headers(init?.headers);
      if (bearer) headers.set("Authorization", `Bearer ${bearer}`);
      const path = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
        "http://houston.invalid",
      ).pathname;
      const accountScoped =
        path.startsWith("/v1/me/plan") ||
        path.startsWith("/v1/me/plus/") ||
        path.startsWith("/v1/me/billing-choice") ||
        path === "/v1/preferences/last_workspace_id" ||
        path === "/v1/preferences/next_step_suggestions";
      const org = accountScoped ? null : getOrg?.();
      if (accountScoped) headers.delete("x-houston-org");
      else if (org) headers.set("x-houston-org", org);
      const appVersion = appVersionHeader();
      if (appVersion) headers.set("X-Houston-App-Version", appVersion);
      return fetch(input, { ...init, headers });
    };
    const bearer = getToken?.() ?? liveToken(fallbackToken);
    const settle = (res: Response, sent: string) =>
      refusesAuthReplay(init)
        ? settleWithoutReplay(res, sent, send)
        : settleGatewayResponse(res, sent, send);
    if (!bearer && inControlPlaneMode()) {
      if (refusesAuthReplay(init)) return signedOutResponse();
      const fresh = await refreshLiveToken();
      if (!fresh) return signedOutResponse();
      return settle(await send(fresh), fresh);
    }
    return settle(await send(bearer), bearer);
  };
}

export async function cpFetch(
  cfg: ControlPlaneConfig,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const doFetch = transientRetryFetch(
    gatewayAuthFetch(cfg.token, () => cfg.activeOrgSlug),
  );
  const res = await doFetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const agentId = agentIdOfPath(path);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new HoustonEngineError(
      res.status,
      body,
      retryAfterMsOf(res.headers),
    );
    if (agentId) err.agentId = agentId;
    throw err;
  }
  if (agentId) wakingStuckTracker.noteSuccess(agentId);
  return res;
}
