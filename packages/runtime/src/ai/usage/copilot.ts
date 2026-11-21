import { serveModeOn } from "../../auth/serve";
import { authStorage, type KeyStore } from "../../auth/storage";
import { config } from "../../config";
import { currentCredentialScope } from "../../session/acting-context";
import {
  clampPercent,
  type ProviderUsage,
  type ProviderUsageWindow,
} from "./types";

const COPILOT_QUOTA_HEADERS = {
  Accept: "application/json",
  "User-Agent": "GitHubCopilotChat/0.35.0",
  "Editor-Version": "vscode/1.107.0",
  "Editor-Plugin-Version": "copilot-chat/0.35.0",
  "X-GitHub-Api-Version": "2025-04-01",
};

type QuotaSnapshot = {
  entitlement?: unknown;
  remaining?: unknown;
  percent_remaining?: unknown;
  unlimited?: unknown;
} | null;

function usedPercent(q: NonNullable<QuotaSnapshot>): number {
  if (typeof q.percent_remaining === "number")
    return clampPercent(100 - q.percent_remaining);
  const entitlement = typeof q.entitlement === "number" ? q.entitlement : 0;
  const remaining = typeof q.remaining === "number" ? q.remaining : 0;
  if (entitlement <= 0) return 0;
  return clampPercent(100 - (remaining / entitlement) * 100);
}

function resetDateToIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value,
  );
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function toWindow(
  id: ProviderUsageWindow["id"],
  q: QuotaSnapshot | undefined,
  resetsAt: string | null,
): ProviderUsageWindow | null {
  if (!q || typeof q !== "object") return null;
  if (q.unlimited === true) return null;
  if (q.entitlement === 0 && q.remaining === 0) return null;
  return { id, usedPercent: usedPercent(q), resetsAt };
}

async function quotaResponseToUsage(res: Response): Promise<ProviderUsage> {
  const provider = "github-copilot";
  if (res.status === 401 || res.status === 403)
    return { provider, status: "unauthenticated", windows: [] };
  if (!res.ok) {
    return {
      provider,
      status: "error",
      windows: [],
      message: `Copilot usage API answered ${res.status}`,
    };
  }
  const body = (await res.json()) as {
    copilot_plan?: unknown;
    quota_reset_date?: unknown;
    quota_snapshots?: {
      premium_interactions?: QuotaSnapshot;
      chat?: QuotaSnapshot;
      completions?: QuotaSnapshot;
    };
  };
  const resetsAt = resetDateToIso(body.quota_reset_date);
  const snapshots = body.quota_snapshots ?? {};
  const windows = [
    toWindow("premium", snapshots.premium_interactions, resetsAt),
    toWindow("chat", snapshots.chat, resetsAt),
    toWindow("completions", snapshots.completions, resetsAt),
  ].filter((w): w is ProviderUsageWindow => w !== null);
  return {
    provider,
    status: "ok",
    windows,
    ...(typeof body.copilot_plan === "string" && body.copilot_plan
      ? { plan: body.copilot_plan }
      : {}),
    fetchedAt: new Date().toISOString(),
  };
}

export interface CopilotServeSource {
  controlPlaneUrl: string;
  sandboxToken: string;
}

function configServeSource(): CopilotServeSource | null {
  return serveModeOn() && config.controlPlaneUrl && config.sandboxToken
    ? {
        controlPlaneUrl: config.controlPlaneUrl,
        sandboxToken: config.sandboxToken,
      }
    : null;
}

export async function fetchCopilotUsage(
  fetchImpl: typeof fetch = fetch,
  store: Pick<KeyStore, "get"> = authStorage,
  serve: CopilotServeSource | null = configServeSource(),
): Promise<ProviderUsage> {
  const provider = "github-copilot";
  const cred = store.get(provider);
  const githubToken = cred?.type === "oauth" ? cred.refresh : null;

  if (githubToken) {
    const apiHost =
      cred?.type === "oauth" && typeof cred.enterpriseUrl === "string"
        ? `api.${cred.enterpriseUrl}`
        : "api.github.com";
    return quotaResponseToUsage(
      await fetchImpl(`https://${apiHost}/copilot_internal/user`, {
        headers: {
          Authorization: `token ${githubToken}`,
          ...COPILOT_QUOTA_HEADERS,
        },
        signal: AbortSignal.timeout(15_000),
      }),
    );
  }

  if (serve && cred) {
    const { actingAs } = currentCredentialScope();
    const res = await fetchImpl(
      `${serve.controlPlaneUrl}/sandbox/provider-usage?provider=${provider}`,
      {
        headers: {
          Authorization: `Bearer ${serve.sandboxToken}`,
          ...(actingAs ? { "x-houston-acting-as": actingAs } : {}),
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (res.status === 404)
      return { provider, status: "unauthenticated", windows: [] };
    return quotaResponseToUsage(res);
  }

  return { provider, status: "unauthenticated", windows: [] };
}
