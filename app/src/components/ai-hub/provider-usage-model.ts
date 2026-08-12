import type { ProviderUsage } from "@houston-ai/engine-client";
import type { ProviderConnectionState } from "../../lib/provider-connection.ts";
import { toCanonicalProviderId } from "../../lib/provider-overrides.ts";
import { type ProviderInfo, providerGatewayIds } from "../../lib/providers.ts";

/**
 * Pure pairing + formatting logic behind the usage meters on the AI Models
 * hub's Connected provider rows (the views are dumb renders — see
 * connected-provider-row.tsx / provider-usage-meters.tsx). Kept UI-free so it's
 * testable with plain node:test (app/tests/ai-hub-usage-model.test.ts).
 */

/** One connected account card paired with its engine usage row. */
export interface AccountUsage {
  provider: ProviderInfo;
  /** The best matching row, or null when the engine reported none. */
  row: ProviderUsage | null;
}

/**
 * How far the ONE usage fetch behind the whole strip has got. Passed down per
 * row so a row can never invent a reading: while `loading` it holds a skeleton,
 * and on `error` it says the fetch failed instead of showing the absent row as
 * "not metered yet" (a lie the beta no-silent-failure policy forbids).
 */
export type UsageFetchState = "loading" | "error" | "ready";

/**
 * Whether ANY account on the strip is a CONFIRMED connection, and therefore
 * whether there is anything to read usage for.
 *
 * The strip's MOUNT cannot stand in for this. The strip is the "yours" side of
 * the hub, so it carries `connected` AND `checking` rows by design
 * (`providerOwnedSide`, HOU-979) — its membership means "the user's accounts",
 * not "accounts we confirmed". Since `providerUsage()` deliberately THROWS
 * rather than fabricate a reading, the fetch has to state its own precondition
 * instead of borrowing the strip's: one confirmed account.
 */
export function hasConfirmedAccount(
  providers: readonly ProviderInfo[],
  connectionState: (provider: ProviderInfo) => ProviderConnectionState,
): boolean {
  return providers.some(
    (provider) => connectionState(provider) === "connected",
  );
}

/**
 * What ONE connected row renders in its usage tier. A discriminated union so
 * the view stays a dumb switch and every branch is unit-testable.
 *
 * `hidden` is the state that keeps the surface honest: a provider Houston could
 * not CONFIRM is signed in has no usage and no metering promise to make, so its
 * row shows nothing there rather than "Houston will start measuring with your
 * next message" — a positive claim about an account we cannot even read.
 */
export type UsageSlotNote = "error" | "notMeteredYet" | "reconnect" | "noData";
export type UsageSlot =
  | { kind: "hidden" }
  | { kind: "loading" }
  | { kind: "note"; note: UsageSlotNote }
  | { kind: "meters"; row: ProviderUsage };

/**
 * Decide a row's usage tier from its connection state, the strip's ONE fetch
 * state, and its paired engine row. Order matters: connection state first (an
 * unconfirmed account never makes a metering claim), then the fetch (a row can
 * never invent a reading the fetch has not delivered), then the row's own
 * status.
 */
export function usageSlot(
  connectionState: ProviderConnectionState,
  fetchState: UsageFetchState,
  row: ProviderUsage | null,
): UsageSlot {
  if (connectionState !== "connected") return { kind: "hidden" };
  if (fetchState === "loading") return { kind: "loading" };
  // A failed fetch says so: with no rows on hand, every other note here would
  // be a claim about an account Houston could not read.
  if (fetchState === "error") return { kind: "note", note: "error" };
  // `unsupported` only ever comes from the never-metered fallback (no usage
  // API + no ledger row yet), so the honest copy is "not measured yet".
  if (!row || row.status === "unsupported")
    return { kind: "note", note: "notMeteredYet" };
  if (row.status === "unauthenticated")
    return { kind: "note", note: "reconnect" };
  if (row.status === "error") return { kind: "note", note: "error" };
  if (row.windows.length === 0 && !row.credits && !row.tokens)
    return { kind: "note", note: "noData" };
  return { kind: "meters", row };
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
 * never silently missing from the strip.
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
 * A localized compact count for the metered token totals ("1.2M", "34.5K"),
 * so the row's spend line stays glanceable at any magnitude.
 */
export function formatTokensAmount(tokens: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, tokens));
}

/**
 * A localized short date ("Jun 12") for the instant metering started, or null
 * when the ledger predates the `since` stamp / carries junk — the card then
 * omits its "since" note instead of showing "Invalid Date".
 */
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

/**
 * A localized amount for a credits figure (remaining or spent): real currency
 * formatting for USD ("$12.34"), a plain localized number for
 * provider-internal credit units (the caller wraps it in the "left"/"used"
 * phrase).
 */
export function formatCreditsAmount(
  amount: number,
  unit: NonNullable<ProviderUsage["credits"]>["unit"],
  locale: string,
): string {
  if (unit === "USD") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
  }).format(amount);
}
