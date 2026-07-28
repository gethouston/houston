import { cn, Skeleton } from "@houston-ai/core";
import type {
  ProviderUsageTokens,
  ProviderUsageWindow,
} from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import {
  formatCreditsAmount,
  formatMeteredSince,
  formatResetWhen,
  formatTokensAmount,
  type UsageSlot,
} from "./provider-usage-model";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The live meters for ONE connected account, rendered inside its row on the AI
 * Models hub (see connected-provider-row.tsx): a labeled bar per rate-limit
 * window (percent used + localized reset note), the remaining prepaid balance
 * for API-key providers, or Houston's own token metering for providers with no
 * usage API. Non-`ok` rows say so honestly (no usage surface, needs a
 * re-sign-in, or the probe's real error) instead of faking an empty meter.
 *
 * Which of those states applies is decided by `usageSlot` (the pure model);
 * this component only renders. Rows whose account is not a CONFIRMED connection
 * never reach here at all — the row omits the tier rather than making a
 * metering claim about an account Houston could not read.
 *
 * The tier is sized by its CONTENT, never by a reservation: an account with one
 * window ends right after that window's bar, with no dead band under it. What
 * keeps the strip still is that the readings are retained across background
 * refetches, so a poll never re-enters the loading frame — the only size change
 * a row can make is the ONE settle from the first skeleton to the first
 * reading, and for the common two-window subscription even that is a no-op
 * (the skeleton is that exact shape, to the pixel).
 */
export function ProviderUsageMeters({ slot }: { slot: UsageSlot }) {
  const { t, i18n } = useTranslation("aiHub");
  return (
    <div className="flex flex-col gap-2.5">
      {slot.kind === "loading" && <MetersSkeleton />}
      {slot.kind === "note" && (
        <p className="text-xs text-ink-muted">
          {t(`providerUsage.${slot.note}`)}
        </p>
      )}
      {slot.kind === "meters" && (
        <>
          {slot.row.windows.map((w) => (
            <UsageWindowBar
              key={w.id}
              window={w}
              locale={i18n.language}
              t={t}
            />
          ))}
          {slot.row.credits && (
            <p className="text-[13px] text-ink tabular-nums">
              {t("providerUsage.creditsLeft", {
                amount: formatCreditsAmount(slot.row.credits, i18n.language),
              })}
            </p>
          )}
          {slot.row.tokens && (
            <MeteredTokens
              tokens={slot.row.tokens}
              locale={i18n.language}
              t={t}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Two window bars, each mirroring {@link UsageWindowBar}'s exact metrics: ONE
 *  pre-data frame in the shape the most common account (a metered subscription)
 *  turns out to have, so that row lands at the same height it loaded at. The
 *  skeleton cannot know an account's real window count, so an account with a
 *  different shape settles once, on first data, and never again. */
function MetersSkeleton() {
  return (
    <>
      <MetersSkeletonBar />
      <MetersSkeletonBar />
    </>
  );
}

function MetersSkeletonBar() {
  return (
    <div aria-hidden>
      {/* h-4 matches the real bar's `text-xs` label line, not the chip inside it. */}
      <div className="flex h-4 items-center justify-between gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="mt-1.5 h-1.5 w-full rounded-full" />
    </div>
  );
}

/**
 * The locally metered spend line for providers with no usage API: total
 * tokens headline, then the input/output split and the date Houston started
 * counting — honest about the source ("measured by Houston"), since the
 * provider itself reports nothing.
 */
function MeteredTokens({
  tokens,
  locale,
  t,
}: {
  tokens: ProviderUsageTokens;
  locale: string;
  t: Translate;
}) {
  const since = formatMeteredSince(tokens.since, locale);
  return (
    <div>
      <p className="text-[13px] text-ink tabular-nums">
        {t("providerUsage.tokensUsed", {
          amount: formatTokensAmount(
            tokens.inputTokens + tokens.outputTokens,
            locale,
          ),
        })}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted tabular-nums">
        {t("providerUsage.tokensSplit", {
          input: formatTokensAmount(tokens.inputTokens, locale),
          output: formatTokensAmount(tokens.outputTokens, locale),
        })}
        {since ? ` · ${t("providerUsage.meteredSince", { when: since })}` : ""}
      </p>
    </div>
  );
}

function UsageWindowBar({
  window: w,
  locale,
  t,
}: {
  window: ProviderUsageWindow;
  locale: string;
  t: Translate;
}) {
  const percent = Math.round(w.usedPercent);
  const when = formatResetWhen(w.resetsAt, locale);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="truncate text-ink">
          {t(`providerUsage.window.${w.id}`)}
        </span>
        <span className="shrink-0 text-ink-muted tabular-nums">
          {t("providerUsage.percentUsed", { percent })}
          {when ? ` · ${t("providerUsage.resets", { when })}` : ""}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-chip">
        <div
          className={cn(
            "h-full rounded-full",
            // A nearly-drained window reads as a warning tint so the one
            // number that matters is visible at a glance.
            percent >= 90 ? "bg-warning" : "bg-action",
          )}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>
    </div>
  );
}
