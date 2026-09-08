import { HoustonEngineError } from "../client/errors";
import { type ControlPlaneConfig, gatewayAuthFetch } from "./fetch";

/** Subject comparison fences UI races only; the gateway still verifies the JWT. */
export function bridgeTokenSubject(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const value: unknown = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (!value || typeof value !== "object" || !("sub" in value)) return null;
    return typeof value.sub === "string" ? value.sub : null;
  } catch {
    return null;
  }
}

export function scopedBridgeFetch(cfg: ControlPlaneConfig, userId: string) {
  const baseUrl = cfg.baseUrl;
  const org = cfg.activeOrgSlug ?? null;
  const guard = (bearer: string) => {
    if (
      cfg.baseUrl !== baseUrl ||
      (cfg.activeOrgSlug ?? null) !== org ||
      bridgeTokenSubject(bearer) !== userId
    ) {
      throw new HoustonEngineError(409, {
        code: "bridge_identity_changed",
        error: "The active workspace changed.",
      });
    }
  };
  const authenticated = gatewayAuthFetch(
    cfg.token,
    () => org,
    undefined,
    guard,
  );
  return async (path: string, init: RequestInit = {}): Promise<Response> => {
    const response = await authenticated(`${baseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
    if (!response.ok) {
      const text = await response.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = {
          code: "bridge_request_failed",
          error: "Local model connection failed.",
        };
      }
      throw new HoustonEngineError(response.status, body);
    }
    return response;
  };
}
