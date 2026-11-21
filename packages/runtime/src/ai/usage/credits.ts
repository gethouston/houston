import { type KeyStore as FullKeyStore, keyStore } from "../../auth/storage";
import type { ProviderUsage } from "./types";

type KeyStore = Pick<FullKeyStore, "has" | "getApiKey">;

async function apiKeyFor(
  store: KeyStore,
  provider: string,
): Promise<string | null> {
  if (!store.has(provider)) return null;
  return (await store.getApiKey(provider)) ?? null;
}

export async function fetchOpenRouterUsage(
  fetchImpl: typeof fetch = fetch,
  store: KeyStore = keyStore,
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
    credits: {
      remaining: Math.max(0, total - used),
      granted: total,
      unit: "USD",
    },
    fetchedAt: new Date().toISOString(),
  };
}

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
