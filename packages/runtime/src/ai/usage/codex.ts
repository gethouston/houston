import type { AuthStorage } from "@earendil-works/pi-coding-agent";
import { authStorage } from "../../auth/storage";
import {
  clampPercent,
  epochSecondsToIso,
  type ProviderUsage,
  type ProviderUsageWindow,
} from "./types";

/**
 * ChatGPT / Codex (Plus / Pro) account usage — the rate-limit windows the Codex
 * product enforces per subscription:
 *
 *   GET https://chatgpt.com/backend-api/wham/usage
 *   Authorization: Bearer <ChatGPT OAuth access token>
 *   ChatGPT-Account-Id: <account id>   (when the credential carries one)
 *
 * Response: `rate_limit.primary_window` / `secondary_window`, each
 * `{used_percent, reset_at: epoch seconds, limit_window_seconds}`, plus
 * `plan_type`.
 */

const USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

type WireWindow = {
  used_percent?: unknown;
  reset_at?: unknown;
  limit_window_seconds?: unknown;
} | null;

/**
 * Classify a Codex window by its length, not its position: ~5h (≤ a day) is
 * the rolling session lane, anything longer is the weekly lane. `fallback`
 * covers a payload that omits `limit_window_seconds`.
 */
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

/** Fetch the connected Codex account's rate-limit windows. */
export async function fetchCodexUsage(
  fetchImpl: typeof fetch = fetch,
  store: Pick<AuthStorage, "get" | "getApiKey"> = authStorage,
): Promise<ProviderUsage> {
  const provider = "openai-codex";
  // getApiKey auto-refreshes the OAuth token under pi's file lock; get() reads
  // the (non-secret-shaped) account id alongside.
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
  ].filter((w): w is ProviderUsageWindow => w !== null);
  return {
    provider,
    status: "ok",
    windows,
    ...(typeof body.plan_type === "string" && body.plan_type
      ? { plan: body.plan_type }
      : {}),
    fetchedAt: new Date().toISOString(),
  };
}
