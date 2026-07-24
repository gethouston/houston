import { serveModeOn } from "../../auth/serve";
import { authStorage, type KeyStore } from "../../auth/storage";
import { config } from "../../config";
import {
  clampPercent,
  type ProviderUsage,
  type ProviderUsageWindow,
} from "./types";

/**
 * GitHub Copilot account quota:
 *
 *   GET https://api.github.com/copilot_internal/user
 *   Authorization: token <GitHub OAuth token>
 *
 * pi's Copilot credential stores the long-lived GitHub OAuth token as
 * `refresh` (the short-lived Copilot session token in `access` is minted from
 * it and carries no quota scope) — so the probe authenticates with `refresh`.
 * Enterprise credentials pin a company domain (`enterpriseUrl`); the probe
 * then targets `api.<domain>` like pi's own token exchange does.
 *
 * Under connect-once serve mode (security Gate #2) the runtime's auth.json is
 * access-only — the GitHub token lives ONLY in the host's central store and is
 * scrubbed here right after login — so this runtime CANNOT run the probe
 * itself (the row read "sign in again" forever on a healthy connection). It
 * instead asks the host's `GET /sandbox/provider-usage`, which runs the same
 * GitHub call centrally and relays the quota payload (numbers and dates,
 * never the token) — mapped below exactly like a direct response.
 *
 * Response: `quota_snapshots.premium_interactions` / `.chat`, each
 * `{entitlement, remaining, percent_remaining, unlimited}`, plus
 * `copilot_plan` and a shared `quota_reset_date`.
 */

/** Mirrored by the host's central probe (packages/host/src/routes/provider-usage.ts). */
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

/**
 * `quota_reset_date` arrives as a plain `yyyy-MM-dd` (or full ISO 8601).
 * Normalize to an ISO instant; a bare date reads as midnight UTC.
 */
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
  if (q.unlimited === true) return null; // nothing to meter
  // Token-based-billing seats answer placeholder zero quotas — drop them
  // rather than render a fake empty bar.
  if (q.entitlement === 0 && q.remaining === 0) return null;
  return { id, usedPercent: usedPercent(q), resetsAt };
}

/**
 * Map a quota response onto the wire row — shared by both probe paths (the
 * direct GitHub call and the host relay, which passes GitHub's payload AND its
 * 401 through unchanged).
 */
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

/** Where the host's central probe lives (serve-mode fallback). Injectable. */
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

/** Fetch the connected Copilot account's quota snapshot. */
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

  // No GitHub token locally, but a credential IS stored (the served/scrubbed
  // access-only entry) → the host holds the token; delegate the probe there.
  // Its marked 404 means the central store has no Copilot connection either.
  if (serve && cred) {
    const res = await fetchImpl(
      `${serve.controlPlaneUrl}/sandbox/provider-usage?provider=${provider}`,
      {
        headers: { Authorization: `Bearer ${serve.sandboxToken}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (res.status === 404)
      return { provider, status: "unauthenticated", windows: [] };
    return quotaResponseToUsage(res);
  }

  return { provider, status: "unauthenticated", windows: [] };
}
