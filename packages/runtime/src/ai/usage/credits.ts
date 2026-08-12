import { type KeyStore as FullKeyStore, keyStore } from "../../auth/storage";
import type { ProviderUsage } from "./types";

/** The slice of the credential store the balance probes read. */
export type KeyStore = Pick<FullKeyStore, "has" | "getApiKey">;

/**
 * Prepaid-credit balances for API-key providers that expose one:
 *
 *   DeepSeek   — GET https://api.deepseek.com/user/balance
 *                → { balance_infos: [{ currency, total_balance: "12.34" }] }
 *
 * Authenticates with the stored API key as a Bearer token. No rate-limit
 * windows here — a balance is the whole story for pay-as-you-go keys.
 * (OpenRouter's two-probe blend lives in `openrouter.ts`.)
 */

export async function apiKeyFor(
  store: KeyStore,
  provider: string,
): Promise<string | null> {
  if (!store.has(provider)) return null; // stored-only, like providerConnected
  return (await store.getApiKey(provider)) ?? null;
}

/** Fetch the DeepSeek account's remaining balance (prefers the USD row). */
export async function fetchDeepSeekUsage(
  fetchImpl: typeof fetch = fetch,
  store: KeyStore = keyStore,
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
