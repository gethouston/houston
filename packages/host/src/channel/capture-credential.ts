import type { CaptureResult, CredentialStore, RuntimeEndpoint } from "../ports";
import { scrubRuntimeRefreshToken } from "./scrub-refresh";

type ExportedCredential = {
  provider?: string;
  kind?: "oauth" | "api_key";
  access?: string;
  refresh?: string;
  expires?: number;
  key?: string;
  accountId?: string;
  enterpriseUrl?: string;
};

/** Store a full runtime credential centrally, then remove its refresh token. */
export async function captureRuntimeCredential(args: {
  endpoint: RuntimeEndpoint;
  credentials: CredentialStore;
  workspaceId: string;
  provider?: string;
  requireRefresh?: boolean;
}): Promise<CaptureResult> {
  const { endpoint, credentials, workspaceId, provider, requireRefresh } = args;
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const exported = await fetch(`${endpoint.baseUrl}/auth/export${query}`, {
    headers: { Authorization: `Bearer ${endpoint.token}` },
  });
  if (!exported.ok) {
    return {
      ok: false,
      status: 502,
      error: "could not read agent credential",
      detail: await exported.text().catch(() => ""),
    };
  }
  const credential = (await exported.json()) as ExportedCredential;
  if (credential.kind === "api_key") {
    if (requireRefresh)
      return { ok: false, status: 400, error: "agent is not connected yet" };
    if (!credential.provider || !credential.key)
      return { ok: false, status: 400, error: "agent is not connected yet" };
    await credentials.put({
      workspaceId,
      provider: credential.provider,
      kind: "api_key",
      accessToken: credential.key,
      refreshToken: "",
      expiresAt: Number.MAX_SAFE_INTEGER,
    });
    return { ok: true, provider: credential.provider };
  }
  if (
    !credential.provider ||
    !credential.access ||
    !credential.refresh ||
    typeof credential.expires !== "number"
  ) {
    return { ok: false, status: 400, error: "agent is not connected yet" };
  }
  await credentials.put({
    workspaceId,
    provider: credential.provider,
    kind: "oauth",
    accessToken: credential.access,
    refreshToken: credential.refresh,
    accountId: credential.accountId,
    expiresAt: credential.expires,
    enterpriseUrl: credential.enterpriseUrl,
  });
  const scrub = await scrubRuntimeRefreshToken(
    `${endpoint.baseUrl}/auth/scrub-refresh`,
    endpoint.token,
  );
  if (!scrub.ok) {
    return {
      ok: false,
      status: 502,
      error:
        "credential stored, but the agent sandbox could not be scrubbed of the refresh token — reconnect to retry",
      detail: scrub.detail,
    };
  }
  return { ok: true, provider: credential.provider };
}
