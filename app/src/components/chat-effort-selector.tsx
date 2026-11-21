import type { Agent } from "@houston/engine-adapter";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { nextEffort } from "../lib/effort-cycle";
import { modelSelectorDecision } from "../lib/model-selector-lock";
import {
  EFFORT_ORDER,
  type EffortLevel,
  getEffortLevels,
  normalizeEffort,
} from "../lib/providers";
import { EffortIcon } from "./effort-icon";

interface ChatEffortSelectorProps {
  provider: string;
  model: string;
  effort?: string;
  onSelect: (effort: EffortLevel) => void;
  agent?: Pick<Agent, "access"> | null;
}

export function ChatEffortSelector({
  provider,
  model,
  effort,
  onSelect,
  agent,
}: ChatEffortSelectorProps) {
  const { t } = useTranslation("chat");
  const { capabilities } = useCapabilities();
  const levels = getEffortLevels(provider, model);
  if (!modelSelectorDecision(capabilities, agent).show) return null;
  if (levels.length === 0) return null;

  const labels: Record<EffortLevel, string> = {
    low: t("modelSelector.effortLevels.low"),
    medium: t("modelSelector.effortLevels.medium"),
    high: t("modelSelector.effortLevels.high"),
    xhigh: t("modelSelector.effortLevels.xhigh"),
  };
  const descriptions: Record<EffortLevel, string> = {
    low: t("modelSelector.effortDescriptions.low"),
    medium: t("modelSelector.effortDescriptions.medium"),
    high: t("modelSelector.effortDescriptions.high"),
    xhigh: t("modelSelector.effortDescriptions.xhigh"),
  };

  const current = normalizeEffort(effort);
  const activeLevel =
    current && levels.includes(current as EffortLevel)
      ? (current as EffortLevel)
      : undefined;
  const nextLevel = nextEffort(levels, current);

  const activeLabel = activeLevel
    ? labels[activeLevel]
    : t("modelSelector.effort");

  return (
    <button
      type="button"
      aria-label={
        activeLevel
          ? t("modelSelector.effortValue", { level: activeLabel })
          : t("modelSelector.effort")
      }
      title={
        activeLevel ? descriptions[activeLevel] : t("modelSelector.effort")
      }
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (nextLevel) onSelect(nextLevel);
      }}
      className="flex shrink-0 items-center justify-center gap-1.5 h-11 min-w-11 px-2 rounded-lg text-xs text-ink-muted whitespace-nowrap hover:text-ink hover:bg-hover transition-[color,background-color,scale] active:scale-[0.96] outline-none md:h-7 md:min-w-0 md:shrink md:active:scale-100 focus-visible:ring-1 focus-visible:ring-focus"
    >
      <EffortIcon levels={EFFORT_ORDER} active={current} className="size-3.5" />
      <span className="hidden md:inline">{activeLabel}</span>
    </button>
  );
}
