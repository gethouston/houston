/**
 * `<ContextMeter />` — composer-toolbar widget showing context-window usage.
 *
 * Gated by the `advanced.context_meter` flag (Phase 2 of RFC #248). A small
 * SVG donut + numeric readout; clicking opens a popover with the full
 * breakdown (`<ContextMeterPopover />`).
 *
 * Drives off `useContextStats(feedItems, provider, model)`; threshold colors
 * shift from neutral → yellow at 70% → red at 90%.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverTrigger, PopoverContent } from "@houston-ai/core";
import type { FeedItem } from "@houston-ai/chat";
import { useContextStats } from "../hooks/use-context-stats";
import { ContextMeterPopover } from "./context-meter-popover";
import { formatTokens } from "../lib/model-limits";

interface Props {
  feedItems: FeedItem[];
  provider: string | null | undefined;
  model: string | null | undefined;
}

const SIZE = 14;
const STROKE = 2.5;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

function thresholdColor(pct: number): string {
  if (pct >= 90) return "stroke-red-500";
  if (pct >= 70) return "stroke-yellow-500";
  return "stroke-primary";
}

export function ContextMeter({ feedItems, provider, model }: Props) {
  const { t } = useTranslation("chat");
  const stats = useContextStats(feedItems, provider, model);
  const [open, setOpen] = useState(false);

  const pct = Math.min(stats.usagePercent, 100);
  const dash = (pct / 100) * CIRC;
  const remainder = CIRC - dash;
  const usedDisplay = formatTokens(stats.usedTokens);
  const maxDisplay = formatTokens(stats.maxTokens);
  const tooltip = t("contextMeter.tooltip", {
    used: usedDisplay,
    max: maxDisplay,
    percent: Math.round(pct),
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={tooltip}
          aria-label={tooltip}
          className="flex items-center gap-1.5 px-1.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              className="opacity-25"
            />
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              strokeWidth={STROKE}
              strokeDasharray={`${dash} ${remainder}`}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              className={`${thresholdColor(pct)} transition-all`}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-xs font-medium tabular-nums">
            {usedDisplay}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-80 p-0">
        <ContextMeterPopover
          stats={stats}
          provider={provider}
          model={model}
        />
      </PopoverContent>
    </Popover>
  );
}
