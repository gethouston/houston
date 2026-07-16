import { Badge, cn } from "@houston-ai/core";
import type {
  ProviderUsageTokens,
  ProviderUsageWindow,
} from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { BrandMark } from "../provider-browser/brand-mark";
import {
  type AccountUsage,
  formatCreditsAmount,
  formatMeteredSince,
  formatResetWhen,
  formatTokensAmount,
} from "./usage-model";

/**
 * One connected account on the Usage tab: brand mark + name (+ plan chip),
 * then the account's live meters — a labeled bar per rate-limit window
 * (percent used + localized reset note), or the remaining prepaid balance for
 * API-key providers. Non-`ok` rows say so honestly (no usage surface, needs a
 * re-sign-in, or the probe's real error) instead of faking an empty meter.
 */
export function UsageProviderCard({ account }: { account: AccountUsage }) {
  const { t, i18n } = useTranslation("aiHub");
  const { provider, row } = account;
  return (
    <li className="rounded-2xl border border-line/60 p-4">
      <div className="flex items-center gap-3">
        <BrandMark providerId={provider.id} size="md" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
          {provider.name}
        </span>
        {row?.plan && (
          <Badge variant="secondary" className="shrink-0 capitalize">
            {row.plan}
          </Badge>
        )}
      </div>
      <div className="mt-3">
        <CardBody account={account} locale={i18n.language} t={t} />
      </div>
    </li>
  );
}

function CardBody({
  account: { row },
  locale,
  t,
}: {
  account: AccountUsage;
  locale: string;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (!row || row.status === "unsupported") {
    return <p className="text-xs text-ink-muted">{t("usage.unsupported")}</p>;
  }
  if (row.status === "unauthenticated") {
    return <p className="text-xs text-ink-muted">{t("usage.reconnect")}</p>;
  }
  if (row.status === "error") {
    return <p className="text-xs text-ink-muted">{t("usage.error")}</p>;
  }
  const credits = row.credits;
  const tokens = row.tokens;
  return (
    <div className="flex flex-col gap-3">
      {row.windows.map((w) => (
        <UsageWindowBar key={w.id} window={w} locale={locale} t={t} />
      ))}
      {credits && (
        <p className="text-sm text-ink">
          {t("usage.creditsLeft", {
            amount: formatCreditsAmount(credits, locale),
          })}
        </p>
      )}
      {tokens && <MeteredTokens tokens={tokens} locale={locale} t={t} />}
      {row.windows.length === 0 && !credits && !tokens && (
        <p className="text-xs text-ink-muted">{t("usage.noData")}</p>
      )}
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
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const since = formatMeteredSince(tokens.since, locale);
  return (
    <div>
      <p className="text-sm text-ink">
        {t("usage.tokensUsed", {
          amount: formatTokensAmount(
            tokens.inputTokens + tokens.outputTokens,
            locale,
          ),
        })}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">
        {t("usage.tokensSplit", {
          input: formatTokensAmount(tokens.inputTokens, locale),
          output: formatTokensAmount(tokens.outputTokens, locale),
        })}
        {since ? ` · ${t("usage.meteredSince", { when: since })}` : ""}
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
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const percent = Math.round(w.usedPercent);
  const when = formatResetWhen(w.resetsAt, locale);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-ink">{t(`usage.window.${w.id}`)}</span>
        <span className="shrink-0 text-ink-muted">
          {t("usage.percentUsed", { percent })}
          {when ? ` · ${t("usage.resets", { when })}` : ""}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-chip">
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
