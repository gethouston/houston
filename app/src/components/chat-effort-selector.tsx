import { useTranslation } from "react-i18next";
import { getEffortLevels, type EffortLevel } from "../lib/providers";
import { nextEffort } from "../lib/effort-cycle";
import { EffortIcon } from "./effort-icon";

interface ChatEffortSelectorProps {
  /** Active provider id — used to look up the model's effort levels. */
  provider: string;
  /** Active model id. */
  model: string;
  /** Current effective effort for the active model. */
  effort?: string;
  /** Called when the user advances to the next level. */
  onSelect: (effort: EffortLevel) => void;
}

/**
 * Reasoning-effort cycle button, rendered beside {@link ChatModelSelector} in
 * the composer. One click advances to the next level the active model accepts,
 * wrapping after the last (low -> ... -> max -> low). The icon's filled bars and
 * the label both track the level, so the control reads at a glance without a
 * menu. Renders nothing when the model has no effort control, so the composer
 * row collapses cleanly.
 */
export function ChatEffortSelector({ provider, model, effort, onSelect }: ChatEffortSelectorProps) {
  const { t } = useTranslation("chat");
  const levels = getEffortLevels(provider, model);
  if (levels.length === 0) return null;

  const labels: Record<EffortLevel, string> = {
    low: t("modelSelector.effortLevels.low"),
    medium: t("modelSelector.effortLevels.medium"),
    high: t("modelSelector.effortLevels.high"),
    xhigh: t("modelSelector.effortLevels.xhigh"),
    max: t("modelSelector.effortLevels.max"),
  };
  const descriptions: Record<EffortLevel, string> = {
    low: t("modelSelector.effortDescriptions.low"),
    medium: t("modelSelector.effortDescriptions.medium"),
    high: t("modelSelector.effortDescriptions.high"),
    xhigh: t("modelSelector.effortDescriptions.xhigh"),
    max: t("modelSelector.effortDescriptions.max"),
  };

  // Stored configs can carry an effort unsupported by the active model; show
  // an unselected state until the next click resets to the model's first level.
  const activeLevel =
    effort && levels.includes(effort as EffortLevel) ? (effort as EffortLevel) : undefined;
  const nextLevel = nextEffort(levels, effort);

  const activeLabel = activeLevel ? labels[activeLevel] : t("modelSelector.effort");

  return (
    <button
      type="button"
      aria-label={
        activeLevel
          ? t("modelSelector.effortValue", { level: activeLabel })
          : t("modelSelector.effort")
      }
      title={activeLevel ? descriptions[activeLevel] : t("modelSelector.effort")}
      // Stop pointer events from bubbling: keeps the board detail panel from
      // reading the click as click-outside and closing the panel.
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (nextLevel) onSelect(nextLevel);
      }}
      className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <EffortIcon levels={levels} active={effort} className="size-3.5" />
      <span>{activeLabel}</span>
    </button>
  );
}
