import type { ProviderUsage } from "@houston/engine-adapter";
import type { ProviderConnectionState } from "../../lib/provider-connection.ts";
import { toCanonicalProviderId } from "../../lib/provider-overrides.ts";
import { type ProviderInfo, providerGatewayIds } from "../../lib/providers.ts";

export interface AccountUsage {
  provider: ProviderInfo;
  row: ProviderUsage | null;
}

export type UsageFetchState = "loading" | "error" | "ready";

export function hasConfirmedAccount(
  providers: readonly ProviderInfo[],
  connectionState: (provider: ProviderInfo) => ProviderConnectionState,
): boolean {
  return providers.some(
    (provider) => connectionState(provider) === "connected",
  );
}

export type UsageSlotNote = "error" | "notMeteredYet" | "reconnect" | "noData";
export type UsageSlot =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "note"; note: UsageSlotNote }
  | { kind: "meters"; row: ProviderUsage };

export function usageSlot(
  connectionState: ProviderConnectionState,
  fetchState: UsageFetchState,
  row: ProviderUsage | null,
): UsageSlot {
  if (connectionState !== "connected") return { kind: "hidden" };
  if (fetchState === "loading") return { kind: "loading" };
  if (fetchState === "error") return { kind: "note", note: "error" };
  if (!row || row.status === "unsupported")
    return { kind: "note", note: "notMeteredYet" };
  if (row.status === "unauthenticated")
    return { kind: "note", note: "reconnect" };
  if (row.status === "error") return { kind: "note", note: "error" };
  if (row.windows.length === 0 && !row.credits && !row.tokens)
    return { kind: "note", note: "noData" };
  return { kind: "meters", row };
}

const STATUS_PRIORITY: Record<ProviderUsage["status"], number> = {
  ok: 0,
  error: 1,
  unauthenticated: 2,
  unsupported: 3,
};

export function matchUsageToProviders(
  connected: readonly ProviderInfo[],
  rows: readonly ProviderUsage[],
): AccountUsage[] {
  return connected.map((provider) => {
    const engineIds = new Set(
      providerGatewayIds(provider).map(toCanonicalProviderId),
    );
    const matched = rows
      .filter((r) => engineIds.has(r.provider))
      .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
    return { provider, row: matched[0] ?? null };
  });
}

export function formatResetWhen(
  resetsAt: string | null,
  locale: string,
  now: number = Date.now(),
): string | null {
  if (!resetsAt) return null;
  const target = Date.parse(resetsAt);
  if (Number.isNaN(target) || target <= now) return null;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  const minutes = Math.max(1, Math.round((target - now) / 60_000));
  if (minutes < 60) return rtf.format(minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 48) return rtf.format(hours, "hour");
  return rtf.format(Math.round(hours / 24), "day");
}

export function formatTokensAmount(tokens: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, tokens));
}

export function formatMeteredSince(
  since: string,
  locale: string,
): string | null {
  const t = Date.parse(since);
  if (Number.isNaN(t)) return null;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(t);
}

export function formatCreditsAmount(
  credits: NonNullable<ProviderUsage["credits"]>,
  locale: string,
): string {
  if (credits.unit === "USD") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(credits.remaining);
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(credits.remaining);
}
