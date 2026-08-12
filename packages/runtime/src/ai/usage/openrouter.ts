import { keyStore } from "../../auth/storage";
import { apiKeyFor, type KeyStore } from "./credits";
import type { ProviderUsage } from "./types";

/**
 * OpenRouter account usage, blended from the two public probes:
 *
 *   GET https://openrouter.ai/api/v1/credits
 *       → { data: { total_credits, total_usage } } — PURCHASED credits only.
 *         Free/promotional grants are invisible here (and the endpoint is
 *         documented management-key-only, answering 403 for plain keys).
 *   GET https://openrouter.ai/api/v1/key
 *       → { data: { usage, limit, limit_remaining, ... } } — the current
 *         key's own spend and optional spend cap; always readable with the
 *         key Houston stores.
 *
 * The blend keeps the row honest for every account shape (PRODUCT-1075):
 * an account that purchased credits shows its real balance; a key created
 * with a cap shows the cap's remainder; a grant-funded account — where no
 * public endpoint reports the balance — shows its real spend flagged
 * `excludesGrants` instead of a false "$0.00 left".
 */

type CreditsProbe =
  | { kind: "ok"; total: number; used: number }
  | { kind: "unauthenticated" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string };

type KeyProbe =
  | { kind: "ok"; used?: number; limit?: number; limitRemaining?: number }
  | { kind: "unauthenticated" }
  | { kind: "error"; message: string };

const finite = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;

async function probeCredits(
  fetchImpl: typeof fetch,
  key: string,
): Promise<CreditsProbe> {
  const res = await fetchImpl("https://openrouter.ai/api/v1/credits", {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401) return { kind: "unauthenticated" };
  // 403 is the documented "not a management key" answer, not a sign-in
  // problem — the same key still serves inference and /key.
  if (res.status === 403) return { kind: "forbidden" };
  if (!res.ok)
    return {
      kind: "error",
      message: `OpenRouter credits API answered ${res.status}`,
    };
  const body = (await res.json()) as {
    data?: { total_credits?: unknown; total_usage?: unknown };
  };
  const total = finite(body.data?.total_credits);
  const used = finite(body.data?.total_usage);
  // A missing/renamed field must read as a probe failure, not a $0 balance.
  if (total === undefined || used === undefined)
    return {
      kind: "error",
      message: "OpenRouter credits response had no readable balance",
    };
  return { kind: "ok", total, used };
}

async function probeKey(
  fetchImpl: typeof fetch,
  key: string,
): Promise<KeyProbe> {
  const res = await fetchImpl("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403)
    return { kind: "unauthenticated" };
  if (!res.ok)
    return {
      kind: "error",
      message: `OpenRouter key API answered ${res.status}`,
    };
  const body = (await res.json()) as {
    data?: { usage?: unknown; limit?: unknown; limit_remaining?: unknown };
  };
  return {
    kind: "ok",
    used: finite(body.data?.usage),
    limit: finite(body.data?.limit),
    limitRemaining: finite(body.data?.limit_remaining),
  };
}

/** Fetch the OpenRouter account's balance/spend (see module doc for shapes). */
export async function fetchOpenRouterUsage(
  fetchImpl: typeof fetch = fetch,
  store: KeyStore = keyStore,
): Promise<ProviderUsage> {
  const provider = "openrouter";
  const key = await apiKeyFor(store, provider);
  if (!key) return { provider, status: "unauthenticated", windows: [] };

  const asError = (e: unknown): { kind: "error"; message: string } => ({
    kind: "error",
    message: e instanceof Error ? e.message : String(e),
  });
  // One probe's outage never sinks the other's reading.
  const [credits, keyInfo] = await Promise.all([
    probeCredits(fetchImpl, key).catch(asError),
    probeKey(fetchImpl, key).catch(asError),
  ]);

  const ok = (
    credits: NonNullable<ProviderUsage["credits"]>,
  ): ProviderUsage => ({
    provider,
    status: "ok",
    windows: [],
    // OpenRouter denominates everything in USD.
    credits,
    fetchedAt: new Date().toISOString(),
  });

  // An account that purchased credits: the classic prepaid balance.
  if (credits.kind === "ok" && credits.total > 0)
    return ok({
      remaining: Math.max(0, credits.total - credits.used),
      granted: credits.total,
      used: credits.used,
      unit: "USD",
    });

  // No purchased balance, but the key carries a spend cap: its remainder is
  // a real "left" figure for everything routed through Houston.
  if (keyInfo.kind === "ok" && keyInfo.limitRemaining !== undefined)
    return ok({
      remaining: Math.max(0, keyInfo.limitRemaining),
      granted: keyInfo.limit,
      used: keyInfo.used,
      unit: "USD",
    });

  // Grant-funded / free-tier account: OpenRouter exposes no balance for it,
  // so report the real spend and say the grants are unreported — never $0.
  if (keyInfo.kind === "ok" || credits.kind === "ok")
    return ok({
      remaining: 0,
      used:
        credits.kind === "ok"
          ? credits.used
          : keyInfo.kind === "ok"
            ? keyInfo.used
            : undefined,
      unit: "USD",
      excludesGrants: true,
    });

  if (credits.kind === "unauthenticated" || keyInfo.kind === "unauthenticated")
    return { provider, status: "unauthenticated", windows: [] };

  return {
    provider,
    status: "error",
    windows: [],
    message:
      (keyInfo.kind === "error" ? keyInfo.message : undefined) ??
      (credits.kind === "error" ? credits.message : undefined) ??
      "OpenRouter usage probes failed",
  };
}
