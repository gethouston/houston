import type { ProviderUsage } from "@houston-ai/engine-client";
import { toCanonicalProviderId } from "../../lib/provider-overrides.ts";
import { type ProviderInfo, providerGatewayIds } from "../../lib/providers.ts";

/**
 * Pure pairing + formatting logic behind the AI Hub's Usage tab (the view is
 * a dumb render — see usage-pane.tsx). Kept UI-free so it's testable with
 * plain node:test (app/tests/ai-hub-usage-model.test.ts).
 */

/** One connected account card paired with its engine usage row. */
export interface AccountUsage {
  provider: ProviderInfo;
  /** The best matching row, or null when the engine reported none. */
  row: ProviderUsage | null;
}

/** Most informative first: a real reading beats any of the failure shapes. */
const STATUS_PRIORITY: Record<ProviderUsage["status"], number> = {
  ok: 0,
  error: 1,
  unauthenticated: 2,
  unsupported: 3,
};

/**
 * Pair each connected provider CARD with its engine usage row. Cards speak
 * display ids (`openai`) and may span several engine gateways (the merged
 * OpenCode account), while rows speak canonical engine ids (`openai-codex`)
 * one per gateway — so match on the canonicalized gateway id set and keep the
 * most informative row. Cards keep the caller's order; a card the engine
 * reported nothing for still appears (row: null) so a connected account is
 * never silently missing from the page.
 */
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

/**
 * A localized "in 2 hours" phrase for a window's reset instant, or null when
 * the instant is absent/past/unparseable (the row then omits its reset note;
 * a past reset means the window has already rolled over).
 */
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

/**
 * A localized amount for a credits balance: real currency formatting for USD
 * balances ("$12.34"), a plain localized number for provider-internal credit
 * units (the caller wraps it in the "left" phrase).
 */
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
