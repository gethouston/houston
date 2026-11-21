import { type KeyStore, keyStore } from "../../auth/storage";
import {
  clampPercent,
  epochSecondsToIso,
  type ProviderUsage,
  type ProviderUsageWindow,
  settleWindow,
} from "./types";

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

type WireWindow = {
  used_percent?: unknown;
  reset_at?: unknown;
  limit_window_seconds?: unknown;
} | null;

function toWindow(
  block: WireWindow | undefined,
  fallback: ProviderUsageWindow["id"],
): ProviderUsageWindow | null {
  if (!block || typeof block !== "object") return null;
  const seconds =
    typeof block.limit_window_seconds === "number"
      ? block.limit_window_seconds
      : null;
  const minutes = seconds ? Math.round(seconds / 60) : null;
  const id: ProviderUsageWindow["id"] =
    minutes === null ? fallback : minutes <= 1_440 ? "session" : "week";
  return {
    id,
    usedPercent: clampPercent(block.used_percent),
    resetsAt: epochSecondsToIso(block.reset_at),
    ...(minutes !== null ? { windowMinutes: minutes } : {}),
  };
}

export async function fetchCodexUsage(
  fetchImpl: typeof fetch = fetch,
  store: Pick<KeyStore, "get" | "getApiKey"> = keyStore,
  now: () => number = Date.now,
): Promise<ProviderUsage> {
  const provider = "openai-codex";
  const token = await store.getApiKey(provider);
  const cred = store.get(provider);
  const accountId =
    cred?.type === "oauth" && typeof cred.accountId === "string"
      ? cred.accountId
      : null;
  if (!token) return { provider, status: "unauthenticated", windows: [] };

  const res = await fetchImpl(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(accountId ? { "ChatGPT-Account-Id": accountId } : {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 401 || res.status === 403)
    return { provider, status: "unauthenticated", windows: [] };
  if (!res.ok) {
    return {
      provider,
      status: "error",
      windows: [],
      message: `Codex usage API answered ${res.status}`,
    };
  }
  const body = (await res.json()) as {
    plan_type?: unknown;
    rate_limit?: {
      primary_window?: WireWindow;
      secondary_window?: WireWindow;
    };
  };
  const windows = [
    toWindow(body.rate_limit?.primary_window, "session"),
    toWindow(body.rate_limit?.secondary_window, "week"),
  ]
    .filter((w): w is ProviderUsageWindow => w !== null)
    .map((w) => settleWindow(w, now()));
  return {
    provider,
    status: "ok",
    windows,
    ...(typeof body.plan_type === "string" && body.plan_type
      ? { plan: body.plan_type }
      : {}),
    fetchedAt: new Date(now()).toISOString(),
  };
}
