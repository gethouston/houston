/**
 * Composer context-usage indicator.
 *
 * A small footer control showing how full the model's context window is for
 * the current conversation. The trigger is a ring gauge (a
 * donut whose arc fills with the occupied fraction and turns red near the
 * limit) plus the bare percentage; hovering reveals the detail. The caller
 * resolves `usage` (latest turn) and `contextWindow` (a self-correcting
 * estimate; see `sessionContextUsage` + `effectiveContextWindow` in
 * `lib/context-usage.ts` and `getContextWindowConfig` in `lib/providers.ts`).
 * When no window is known for a model it degrades to a raw token count rather
 * than a misleading percentage.
 *
 * App-side (not in `ui/`) because it depends on the app's model catalog and
 * i18n; it uses `t()` directly per the library-boundary rule.
 */

import { useTranslation } from "react-i18next";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
  Progress,
} from "@houston-ai/core";
import type { TokenUsage } from "@houston-ai/chat";
import { contextFillPercent } from "../lib/context-usage";

interface ContextIndicatorProps {
  /** Latest turn's usage, or null when no turn has reported it yet. */
  usage: TokenUsage | null;
  /** Active model's max context window in tokens, if catalogued. */
  contextWindow?: number;
}

/** Threshold at which the indicator warns the window is nearly full. */
const WARN_PERCENT = 90;

/**
 * Context gauge: a ring whose arc fills clockwise from 12
 * o'clock in proportion to `percent` (0-100), over a faint full-circle track.
 * The arc follows `currentColor`, so the caller turns it red by setting
 * `text-destructive`. A `null` percent (unknown window or no usage yet) shows
 * the bare track.
 */
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
        className="stroke-muted-foreground/25"
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

  // A directly-narrowable `number | null` — TypeScript won't carry a boolean
  // alias's narrowing of `contextWindow` across the JSX branches below, so we
  // branch on this value itself and read it where it's already proven non-null.
  const windowTokens =
    typeof contextWindow === "number" && contextWindow > 0
      ? contextWindow
      : null;
  const percent = contextFillPercent(usage, windowTokens);
  const warn = percent != null && percent >= WARN_PERCENT;

  // Compact, rounded token counts (e.g. "100K", "10.5K", "1M") — locale-aware.
  const fmt = (n: number) =>
    new Intl.NumberFormat(i18n.language, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          aria-label={t("button.aria")}
          className={`inline-flex items-center justify-center size-7 rounded-full transition-colors hover:bg-accent ${
            warn
              ? "text-destructive"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <ContextRing percent={percent} />
        </button>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="flex w-64 flex-col gap-2">
        <p className="text-sm font-medium leading-none">{t("card.title")}</p>

        {!usage ? (
          <p className="text-sm text-muted-foreground">{t("card.empty")}</p>
        ) : windowTokens != null ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span
                className={`text-2xl font-semibold tabular-nums ${
                  warn ? "text-destructive" : ""
                }`}
              >
                {t("card.percent", { percent: percent ?? 0 })}
              </span>
              <span className="text-xs text-muted-foreground tabular-nums">
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
            <p className="text-xs text-muted-foreground">
              {t("card.unknownWindow")}
            </p>
          </>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
