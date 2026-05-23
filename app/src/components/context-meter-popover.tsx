/**
 * `<ContextMeterPopover />` — the rich breakdown shown when the user clicks
 * the composer-toolbar context wheel.
 *
 * Three blocks:
 *   1. Header   — model name, used/max + percent, progress bar
 *   2. Breakdown — per-category token estimates (heuristic) + Free space
 *   3. Metrics  — turn count, total duration, cost (Claude only),
 *                 cache-hit rate (Claude only), tool calls, file changes
 *
 * The breakdown is intentionally explicit about its estimation: when the
 * latest `FinalResult` carried real `input_tokens`, the meter total is
 * authoritative; the per-row split is still a chars/4 estimate. Surfaced
 * via the "estimated" footnote.
 */
import { useTranslation } from "react-i18next";
import { formatTokens } from "../lib/model-limits";
import type { ContextStats } from "../hooks/use-context-stats";

interface Props {
  stats: ContextStats;
  provider: string | null | undefined;
  model: string | null | undefined;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(3)}`;
  return `$${usd.toFixed(2)}`;
}

function thresholdBg(pct: number): string {
  if (pct >= 90) return "bg-red-500";
  if (pct >= 70) return "bg-yellow-500";
  return "bg-primary";
}

export function ContextMeterPopover({ stats, provider, model }: Props) {
  const { t } = useTranslation("chat");
  const pct = Math.min(stats.usagePercent, 100);
  const modelLabel = [provider, model].filter(Boolean).join(" · ") || "—";

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("contextMeter.title")}</h3>
          <span className="text-xs tabular-nums text-muted-foreground">
            {formatTokens(stats.usedTokens)} / {formatTokens(stats.maxTokens)}
          </span>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{modelLabel}</p>
        <div className="mt-2 h-1.5 w-full rounded-full bg-secondary overflow-hidden">
          <div
            className={`h-full ${thresholdBg(pct)} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Breakdown */}
      <div className="flex flex-col gap-1">
        <BreakdownLine
          label={t("contextMeter.breakdown.free")}
          tokens={stats.freeTokens}
          percent={stats.freePercent}
          muted
        />
        {stats.breakdown
          .filter((row) => row.tokens > 0)
          .sort((a, b) => b.tokens - a.tokens)
          .map((row) => (
            <BreakdownLine
              key={row.key}
              label={t(`contextMeter.breakdown.${row.key}` as never)}
              tokens={row.tokens}
              percent={row.percent}
            />
          ))}
        {!stats.hasRealData && (
          <p className="mt-1 text-[10px] italic text-muted-foreground">
            {t("contextMeter.estimatedNote")}
          </p>
        )}
      </div>

      {/* Other metrics */}
      <div className="border-t border-border pt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <Metric
          label={t("contextMeter.metrics.turns")}
          value={String(stats.turnCount)}
        />
        <Metric
          label={t("contextMeter.metrics.duration")}
          value={
            stats.totalDurationMs > 0 ? formatDuration(stats.totalDurationMs) : "—"
          }
        />
        <Metric
          label={t("contextMeter.metrics.cost")}
          value={stats.totalCostUsd > 0 ? formatCost(stats.totalCostUsd) : "—"}
        />
        <Metric
          label={t("contextMeter.metrics.cacheHit")}
          value={
            stats.cacheHitRate != null
              ? `${Math.round(stats.cacheHitRate * 100)}%`
              : "—"
          }
        />
        <Metric
          label={t("contextMeter.metrics.toolCalls")}
          value={String(stats.toolCallCount)}
        />
        <Metric
          label={t("contextMeter.metrics.fileChanges")}
          value={String(stats.fileChangeCount)}
        />
      </div>
    </div>
  );
}

function BreakdownLine({
  label,
  tokens,
  percent,
  muted = false,
}: {
  label: string;
  tokens: number;
  percent: number;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between text-[11px] tabular-nums ${
        muted ? "text-muted-foreground" : "text-foreground"
      }`}
    >
      <span>{label}</span>
      <span className="text-muted-foreground">
        {formatTokens(tokens)}{" "}
        <span className="opacity-60">({percent.toFixed(1)}%)</span>
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}
