import type {
  AuthStatus,
  CustomEndpoint,
  LoginInfo,
  ProviderId,
} from "./types";

export abstract class EngineCredentialClient {
  protected abstract json<T>(path: string, init?: RequestInit): Promise<T>;

  authStatus() {
    return this.json<AuthStatus>("/auth/status");
  }
  startLogin(
    provider: ProviderId,
    deviceAuth = true,
    enterpriseDomain?: string,
  ) {
    const params = new URLSearchParams();
    if (!deviceAuth) params.set("deviceAuth", "false");
    if (enterpriseDomain) params.set("enterpriseDomain", enterpriseDomain);
    const qs = params.toString();
    return this.json<LoginInfo>(
      `/auth/${encodeURIComponent(provider)}/login${qs ? `?${qs}` : ""}`,
      { method: "POST" },
    );
  }
  cancelLogin(provider: ProviderId) {
    return this.json<{ ok: boolean }>(
      `/auth/${encodeURIComponent(provider)}/login/cancel`,
      {
        method: "POST",
      },
    );
  }
  completeLogin(provider: ProviderId, code: string) {
    return this.json<{ ok: boolean }>(
      `/auth/${encodeURIComponent(provider)}/login/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      },
    );
  }
  setApiKey(provider: ProviderId, key: string, endpoint?: string) {
    return this.json<{ ok: boolean }>(
      `/auth/${encodeURIComponent(provider)}/api-key`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, ...(endpoint ? { endpoint } : {}) }),
      },
    );
  }
  setCustomEndpoint(endpoint: CustomEndpoint) {
    return this.json<{ ok: boolean }>("/providers/openai-compatible", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(endpoint),
    });
  }
  logout(provider: ProviderId) {
    return this.json<{ ok: boolean }>(
      `/auth/${encodeURIComponent(provider)}/logout`,
      {
        method: "POST",
      },
    );
  }
}
