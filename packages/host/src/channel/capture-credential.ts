import { deadGoogleApiKey } from "@houston/protocol/google-key";
import type { CaptureResult, CredentialStore, RuntimeEndpoint } from "../ports";
import { scrubRuntimeRefreshToken } from "./scrub-refresh";

// WHY: Under the runtime's 10 s serve probe; undici would otherwise wait 300 s for headers. ADR-0016
const RUNTIME_EXPORT_TIMEOUT_MS = 8_000;

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

// WHY: The scrub must name the provider; an unscoped scrub erases every refresh token. ADR-0016
export async function captureRuntimeCredential(args: {
  endpoint: RuntimeEndpoint;
  credentials: CredentialStore;
  workspaceId: string;
  provider?: string;
  localOriginOnly?: boolean;
  actingAs?: string;
  ifAbsent?: boolean;
  anthropicServedHere?: boolean;
}): Promise<CaptureResult> {
  const {
    endpoint,
    credentials,
    workspaceId,
    provider,
    localOriginOnly,
    actingAs,
    ifAbsent,
  } = args;
  const localAnthropic = (id: string | undefined) =>
    id === "anthropic" && args.anthropicServedHere === false;
  const params = new URLSearchParams();
  if (provider) params.set("provider", provider);
  if (localOriginOnly) params.set("excludeServed", "1");
  const query = params.size ? `?${params}` : "";
  const exported = await fetch(`${endpoint.baseUrl}/auth/export${query}`, {
    headers: {
      Authorization: `Bearer ${endpoint.token}`,
      ...(actingAs ? { "x-houston-acting-as": actingAs } : {}),
    },
    signal: AbortSignal.timeout(RUNTIME_EXPORT_TIMEOUT_MS),
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
    if (!credential.provider || !credential.key)
      return { ok: false, status: 400, error: "agent is not connected yet" };
    if (
      deadGoogleApiKey({
        provider: credential.provider,
        kind: "api_key",
        access: credential.key,
      })
    ) {
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
        ...(credential.enterpriseUrl
          ? { enterpriseUrl: credential.enterpriseUrl }
          : {}),
      },
      { actingAs, ifAbsent },
    );
    return { ok: true, provider: credential.provider };
  }
  if (
    !credential.provider ||
    !credential.access ||
    !credential.refresh ||
    typeof credential.expires !== "number"
  ) {
    if (provider && (await settledCentrally(credentials, args))) {
      return { ok: true, provider };
    }
    if (localAnthropic(provider) && provider) {
      return (await runtimeReportsConnected(endpoint, provider, actingAs))
        ? { ok: true, provider }
        : { ok: false, status: 400, error: "agent is not connected yet" };
    }
    return { ok: false, status: 400, error: "agent is not connected yet" };
  }
  if (localAnthropic(credential.provider)) {
    return { ok: true, provider: credential.provider };
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
    { actingAs, ifAbsent },
  );
  const scrub = await scrubRuntimeRefreshToken(
    `${endpoint.baseUrl}/auth/scrub-refresh`,
    endpoint.token,
    credential.provider,
    actingAs,
  );
  if (!scrub.ok) {
    console.error(
      `[capture] PRODUCT-1318: captured ${credential.provider} centrally but scrubbing the runtime's refresh token failed after retries — the serve-sync self-heal will finish it${scrub.detail ? ` (${scrub.detail})` : ""}`,
    );
  }
  return { ok: true, provider: credential.provider };
}

async function settledCentrally(
  credentials: CredentialStore,
  args: { workspaceId: string; provider?: string; actingAs?: string },
): Promise<boolean> {
  if (!args.provider) return false;
  try {
    return (
      (await credentials.get(args.workspaceId, args.provider, {
        actingAs: args.actingAs,
      })) !== null
    );
  } catch (err) {
    console.warn(
      `[capture] settlement probe for ${args.provider} failed:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}

async function runtimeReportsConnected(
  endpoint: RuntimeEndpoint,
  provider: string,
  actingAs: string | undefined,
): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint.baseUrl}/auth/status`, {
      headers: {
        Authorization: `Bearer ${endpoint.token}`,
        ...(actingAs ? { "x-houston-acting-as": actingAs } : {}),
      },
    });
    if (!res.ok) {
      console.warn(
        `[capture] ${provider} status probe answered ${res.status}; reading it as not connected`,
      );
      return false;
    }
    const status = (await res.json()) as {
      providers?: Array<{ provider?: string; configured?: boolean }>;
    };
    return (
      status.providers?.some(
        (p) => p.provider === provider && p.configured === true,
      ) ?? false
    );
  } catch (err) {
    console.warn(
      `[capture] ${provider} status probe failed:`,
      err instanceof Error ? err.message : err,
    );
    return false;
  }
}
