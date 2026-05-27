import { useTranslation } from "react-i18next";
import { ChevronDown, Check, Gauge } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@houston-ai/core";
import { getEffortLevels, type EffortLevel } from "../lib/providers";

interface ChatEffortSelectorProps {
  /** Active provider id — used to look up the model's effort levels. */
  provider: string;
  /** Active model id. */
  model: string;
  /** Current effective effort for the active model. */
  effort?: string;
  /** Called when the user picks a level. */
  onSelect: (effort: EffortLevel) => void;
}

/**
 * Standalone reasoning-effort picker, rendered beside {@link ChatModelSelector}
 * in the composer. Shows only the levels the active model accepts (Sonnet
 * never offers `xhigh`, Codex never `max`) and renders nothing when the model
 * has no effort control (e.g. Gemini), so the composer row collapses cleanly.
 */
export function ChatEffortSelector({ provider, model, effort, onSelect }: ChatEffortSelectorProps) {
  const { t } = useTranslation("chat");
  const levels = getEffortLevels(provider, model);
  if (levels.length === 0) return null;

  const labels: Record<EffortLevel, { label: string; description: string }> = {
    low: {
      label: t("modelSelector.effortLevels.low"),
      description: t("modelSelector.effortDescriptions.low"),
    },
    medium: {
      label: t("modelSelector.effortLevels.medium"),
      description: t("modelSelector.effortDescriptions.medium"),
    },
    high: {
      label: t("modelSelector.effortLevels.high"),
      description: t("modelSelector.effortDescriptions.high"),
    },
    xhigh: {
      label: t("modelSelector.effortLevels.xhigh"),
      description: t("modelSelector.effortDescriptions.xhigh"),
    },
    max: {
      label: t("modelSelector.effortLevels.max"),
      description: t("modelSelector.effortDescriptions.max"),
    },
  };
  const activeLabel =
    effort && labels[effort as EffortLevel]
      ? labels[effort as EffortLevel].label
      : t("modelSelector.effort");

  return (
    // Stop pointer events from bubbling — keeps the board detail panel from
    // reading dropdown clicks as "click outside → close panel".
    <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("modelSelector.effort")}
            className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Gauge className="size-3.5" />
            <span>{activeLabel}</span>
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-56"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {levels.map((level) => {
            const isActive = level === effort;
            return (
              <DropdownMenuItem
                key={level}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(level);
                }}
                className="flex items-start gap-2.5 py-1.5"
              >
                <div className="w-4 shrink-0 mt-0.5 flex justify-center">
                  {isActive && <Check className="h-3.5 w-3.5 text-foreground" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{labels[level].label}</div>
                  <div className="text-xs text-muted-foreground leading-snug">
                    {labels[level].description}
                  </div>
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
