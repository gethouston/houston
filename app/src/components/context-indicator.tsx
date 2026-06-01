/**
 * Composer context-usage indicator.
 *
 * A small footer pill that shows how full the model's context window is for
 * the current conversation, opening a dialog with the detail. The caller
 * resolves `usage` (latest turn) and `contextWindow` (a self-correcting
 * estimate; see `sessionContextUsage` + `effectiveContextWindow` in
 * `lib/context-usage.ts` and `getContextWindowConfig` in `lib/providers.ts`).
 * The window is plan/credit-gated and not reported by `claude -p`, so the
 * dialog labels the figure "estimated". When no window is known for a model
 * it degrades to a raw token count rather than a misleading percentage.
 *
 * App-side (not in `ui/`) because it depends on the app's model catalog and
 * i18n; it uses `t()` directly per the library-boundary rule.
 */

import { useTranslation } from "react-i18next";
import { Gauge } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Progress,
} from "@houston-ai/core";
import type { TokenUsage } from "@houston-ai/chat";

interface ContextIndicatorProps {
  /** Latest turn's usage, or null when no turn has reported it yet. */
  usage: TokenUsage | null;
  /** Active model's max context window in tokens, if catalogued. */
  contextWindow?: number;
  /** Human-readable model label (e.g. "Sonnet 4.6"). */
  modelLabel?: string;
}

/** Threshold at which the indicator warns the window is nearly full. */
const WARN_PERCENT = 90;

export function ContextIndicator({
  usage,
  contextWindow,
  modelLabel,
}: ContextIndicatorProps) {
  const { t, i18n } = useTranslation("context");

  // A directly-narrowable `number | null` — TypeScript won't carry a boolean
  // alias's narrowing of `contextWindow` across the JSX branches below, so we
  // branch on this value itself and read it where it's already proven non-null.
  const windowTokens =
    typeof contextWindow === "number" && contextWindow > 0
      ? contextWindow
      : null;
  const percent =
    usage && windowTokens != null
      ? Math.min(
          100,
          Math.max(0, Math.round((usage.context_tokens / windowTokens) * 100)),
        )
      : null;
  const warn = percent != null && percent >= WARN_PERCENT;

  const fmt = (n: number) => n.toLocaleString(i18n.language);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={t("button.aria")}
          title={percent != null ? t("dialog.estimated") : undefined}
          className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-medium transition-colors hover:bg-accent ${
            warn
              ? "text-destructive"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Gauge className="size-3.5" />
          {percent != null ? `${percent}%` : t("button.label")}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md" closeLabel={t("dialog.close")}>
        <DialogHeader>
          <DialogTitle>{t("dialog.title")}</DialogTitle>
          <DialogDescription>
            {modelLabel
              ? t("dialog.subtitle", { model: modelLabel })
              : t("dialog.subtitleNoModel")}
          </DialogDescription>
        </DialogHeader>

        {!usage ? (
          <p className="text-sm text-muted-foreground">{t("dialog.empty")}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {windowTokens != null ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-2xl font-semibold tabular-nums">
                    {t("dialog.percentFull", { percent: percent ?? 0 })}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t("dialog.usedOfTotal", {
                      used: fmt(usage.context_tokens),
                      total: fmt(windowTokens),
                    })}
                  </span>
                </div>
                <Progress value={percent ?? 0} aria-label={t("dialog.title")} />
                <p className="text-xs text-muted-foreground tabular-nums">
                  {t("dialog.free", {
                    free: fmt(Math.max(0, windowTokens - usage.context_tokens)),
                  })}
                </p>
                <p className="text-[11px] text-muted-foreground/80">
                  {t("dialog.estimated")}
                </p>
              </>
            ) : (
              <>
                <span className="text-lg font-semibold tabular-nums">
                  {t("dialog.tokensUsed", { used: fmt(usage.context_tokens) })}
                </span>
                <p className="text-xs text-muted-foreground">
                  {t("dialog.unknownWindow")}
                </p>
              </>
            )}

            {(usage.cached_tokens > 0 || usage.output_tokens > 0) && (
              <dl className="flex flex-col gap-1 border-t border-border/50 pt-3 text-xs">
                {usage.cached_tokens > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {t("dialog.cached")}
                    </dt>
                    <dd className="tabular-nums">{fmt(usage.cached_tokens)}</dd>
                  </div>
                )}
                {usage.output_tokens > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {t("dialog.lastReply")}
                    </dt>
                    <dd className="tabular-nums">{fmt(usage.output_tokens)}</dd>
                  </div>
                )}
              </dl>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
