import type { AuthStorage } from "@earendil-works/pi-coding-agent";
import { authStorage } from "../../auth/storage";
import type { ProviderUsage } from "./types";

/** The slice of the credential store the balance probes read. */
type KeyStore = Pick<AuthStorage, "has" | "getApiKey">;

/**
 * Prepaid-credit balances for the API-key providers that expose one:
 *
 *   OpenRouter — GET https://openrouter.ai/api/v1/credits
 *                → { data: { total_credits, total_usage } }
 *   DeepSeek   — GET https://api.deepseek.com/user/balance
 *                → { balance_infos: [{ currency, total_balance: "12.34" }] }
 *
 * Both authenticate with the stored API key as a Bearer token. No rate-limit
 * windows here — a balance is the whole story for pay-as-you-go keys.
 */

async function apiKeyFor(
  store: KeyStore,
  provider: string,
): Promise<string | null> {
  if (!store.has(provider)) return null; // stored-only, like providerConnected
  return (await store.getApiKey(provider)) ?? null;
}

/** Fetch the OpenRouter account's remaining prepaid credits. */
export async function fetchOpenRouterUsage(
  fetchImpl: typeof fetch = fetch,
  store: KeyStore = authStorage,
): Promise<ProviderUsage> {
  const provider = "openrouter";
  const key = await apiKeyFor(store, provider);
  if (!key) return { provider, status: "unauthenticated", windows: [] };

  const res = await fetchImpl("https://openrouter.ai/api/v1/credits", {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403)
    return { provider, status: "unauthenticated", windows: [] };
  if (!res.ok) {
    return {
      provider,
      status: "error",
      windows: [],
      message: `OpenRouter credits API answered ${res.status}`,
    };
  }
  const body = (await res.json()) as {
    data?: { total_credits?: unknown; total_usage?: unknown };
  };
  const total = body.data?.total_credits;
  const used = body.data?.total_usage;
  // A missing/renamed field must read as a probe failure, not a $0 balance.
  if (typeof total !== "number" || typeof used !== "number") {
    return {
      provider,
      status: "error",
      windows: [],
      message: "OpenRouter credits response had no readable balance",
    };
  }
  return {
    provider,
    status: "ok",
    windows: [],
    // OpenRouter credits are denominated in USD.
    credits: {
      remaining: Math.max(0, total - used),
      granted: total,
      unit: "USD",
    },
    fetchedAt: new Date().toISOString(),
  };
}

/** Fetch the DeepSeek account's remaining balance (prefers the USD row). */
export async function fetchDeepSeekUsage(
  fetchImpl: typeof fetch = fetch,
  store: KeyStore = authStorage,
): Promise<ProviderUsage> {
  const provider = "deepseek";
  const key = await apiKeyFor(store, provider);
  if (!key) return { provider, status: "unauthenticated", windows: [] };

  const res = await fetchImpl("https://api.deepseek.com/user/balance", {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403)
    return { provider, status: "unauthenticated", windows: [] };
  if (!res.ok) {
    return {
      provider,
      status: "error",
      windows: [],
      message: `DeepSeek balance API answered ${res.status}`,
    };
  }
  const body = (await res.json()) as {
    balance_infos?: { currency?: unknown; total_balance?: unknown }[];
  };
  const rows = Array.isArray(body.balance_infos) ? body.balance_infos : [];
  // DeepSeek reports balances as strings, one row per currency.
  const preferred = rows.find((r) => r.currency === "USD") ?? rows[0];
  const remaining = Number.parseFloat(String(preferred?.total_balance ?? ""));
  if (!Number.isFinite(remaining)) {
    return {
      provider,
      status: "error",
      windows: [],
      message: "DeepSeek balance response had no readable balance",
    };
  }
  return {
    provider,
    status: "ok",
    windows: [],
    credits: {
      remaining,
      unit: preferred?.currency === "USD" ? "USD" : "credits",
    },
    fetchedAt: new Date().toISOString(),
  };
}
