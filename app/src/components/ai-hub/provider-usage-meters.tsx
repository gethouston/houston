import type {
  ProviderUsageTokens,
  ProviderUsageWindow,
} from "@houston/engine-adapter";
import { cn, Skeleton } from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import {
  formatCreditsAmount,
  formatMeteredSince,
  formatResetWhen,
  formatTokensAmount,
  type UsageSlot,
} from "./provider-usage-model";
import { settleUsageWindow } from "./provider-usage-window";

type Translate = (key: string, options?: Record<string, unknown>) => string;

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
      <div className="flex h-4 items-center justify-between gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="mt-1.5 h-1.5 w-full rounded-full" />
    </div>
  );
}

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
  window,
  locale,
  t,
}: {
  window: ProviderUsageWindow;
  locale: string;
  t: Translate;
}) {
  const w = settleUsageWindow(window);
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
            percent >= 90 ? "bg-warning" : "bg-action",
          )}
          style={{ width: `${Math.max(2, percent)}%` }}
        />
      </div>
    </div>
  );
}
