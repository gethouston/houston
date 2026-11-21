import type { TokenUsage } from "@houston-ai/chat";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Progress,
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
  useIsMobile,
} from "@houston-ai/core";
import { useTranslation } from "react-i18next";
import { contextFillPercent } from "../lib/context-usage";

interface ContextIndicatorProps {
  usage: TokenUsage | null;
  contextWindow?: number;
}

const WARN_PERCENT = 90;

function ContextRing({ percent }: { percent: number | null }) {
  const pct = percent == null ? 0 : Math.min(100, Math.max(0, percent));
  const radius = 12;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 32 32" className="size-4 -rotate-90" aria-hidden="true">
      <circle
        cx="16"
        cy="16"
        r={radius}
        fill="none"
        strokeWidth="5"
        className="stroke-ink-muted/25"
      />
      {pct > 0 && (
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          strokeWidth="5"
          strokeLinecap="round"
          className="stroke-current"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
        />
      )}
    </svg>
  );
}

export function ContextIndicator({
  usage,
  contextWindow,
}: ContextIndicatorProps) {
  const { t, i18n } = useTranslation("context");
  const isMobile = useIsMobile();

  const windowTokens =
    typeof contextWindow === "number" && contextWindow > 0
      ? contextWindow
      : null;
  const percent = contextFillPercent(usage, windowTokens);
  const warn = percent != null && percent >= WARN_PERCENT;

  const fmt = (n: number) =>
    new Intl.NumberFormat(i18n.language, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);

  const trigger = (
    <button
      type="button"
      aria-label={t("button.aria")}
      className={`inline-flex items-center justify-center size-11 rounded-full transition-[color,background-color,scale] hover:bg-hover active:scale-[0.96] md:size-7 md:active:scale-100 ${
        warn ? "text-danger" : "text-ink-muted hover:text-ink"
      }`}
    >
      <ContextRing percent={percent} />
    </button>
  );
  const detail = (
    <>
      {!usage ? (
        <p className="text-sm text-ink-muted">{t("card.empty")}</p>
      ) : windowTokens != null ? (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span
              className={`text-2xl font-semibold tabular-nums ${
                warn ? "text-danger" : ""
              }`}
            >
              {t("card.percent", { percent: percent ?? 0 })}
            </span>
            <span className="text-xs text-ink-muted tabular-nums">
              {t("card.usedOfTotal", {
                used: fmt(usage.context_tokens),
                total: fmt(windowTokens),
              })}
            </span>
          </div>
          <Progress value={percent ?? 0} aria-label={t("card.title")} />
        </>
      ) : (
        <>
          <span className="text-lg font-semibold tabular-nums">
            {t("card.tokensUsed", { used: fmt(usage.context_tokens) })}
          </span>
          <p className="text-xs text-ink-muted">{t("card.unknownWindow")}</p>
        </>
      )}
    </>
  );

  if (isMobile) {
    return (
      <ResponsivePopover>
        <ResponsivePopoverTrigger asChild>{trigger}</ResponsivePopoverTrigger>
        <ResponsivePopoverContent title={t("card.title")}>
          <div className="flex flex-col gap-2 px-4 pb-4">{detail}</div>
        </ResponsivePopoverContent>
      </ResponsivePopover>
    );
  }

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>{trigger}</HoverCardTrigger>
      <HoverCardContent
        align="end"
        className="flex w-64 flex-col gap-2 rounded-2xl"
      >
        <p className="text-sm font-medium leading-none">{t("card.title")}</p>
        {detail}
      </HoverCardContent>
    </HoverCard>
  );
}
