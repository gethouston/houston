import { deadGoogleApiKey } from "@houston/protocol/google-key";
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

/**
 * Store a full runtime credential centrally, then remove its refresh token.
 *
 * Scoped by `actingAs` end to end (HOU-976): the runtime keeps one auth file per
 * member, so the export must be read AS that member, the central write must land
 * on that member's row, and the scrub must clear that member's file — mixing the
 * three would capture one member's credential into another's row. Undefined (the
 * desktop, self-host, every pre-HOU-976 caller) is the single shared scope,
 * byte-identical to before.
 */
export async function captureRuntimeCredential(args: {
  endpoint: RuntimeEndpoint;
  credentials: CredentialStore;
  workspaceId: string;
  provider?: string;
  requireRefresh?: boolean;
  actingAs?: string;
}): Promise<CaptureResult> {
  const {
    endpoint,
    credentials,
    workspaceId,
    provider,
    requireRefresh,
    actingAs,
  } = args;
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : "";
  const exported = await fetch(`${endpoint.baseUrl}/auth/export${query}`, {
    headers: {
      Authorization: `Bearer ${endpoint.token}`,
      ...(actingAs ? { "x-houston-acting-as": actingAs } : {}),
    },
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
    if (
      deadGoogleApiKey({
        provider: credential.provider,
        kind: "api_key",
        access: credential.key,
      })
    ) {
      // A legacy pre-verification runtime entry (HOU-1107). Capturing it would
      // seed the central store with a key every serve immediately refuses
      // (Sentry HOUSTON-APP-567) — reject it so the connect flow shows the
      // paste-a-key card instead of a false "connected".
      return {
        ok: false,
        status: 400,
        error:
          "the stored google credential is an OAuth-type token, not an API key — reconnect google by pasting a Gemini API key",
      };
    }
    await credentials.put(
      {
        workspaceId,
        provider: credential.provider,
        kind: "api_key",
        accessToken: credential.key,
        refreshToken: "",
        expiresAt: Number.MAX_SAFE_INTEGER,
      },
      { actingAs },
    );
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
  await credentials.put(
    {
      workspaceId,
      provider: credential.provider,
      kind: "oauth",
      accessToken: credential.access,
      refreshToken: credential.refresh,
      accountId: credential.accountId,
      expiresAt: credential.expires,
      enterpriseUrl: credential.enterpriseUrl,
    },
    { actingAs },
  );
  const scrub = await scrubRuntimeRefreshToken(
    `${endpoint.baseUrl}/auth/scrub-refresh`,
    endpoint.token,
    actingAs,
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
