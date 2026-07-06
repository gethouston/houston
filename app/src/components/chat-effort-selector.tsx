import type { Agent } from "@houston-ai/engine-client";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { nextEffort } from "../lib/effort-cycle";
import { shouldShowModelSelector } from "../lib/model-selector-lock";
import {
  EFFORT_ORDER,
  type EffortLevel,
  getEffortLevels,
} from "../lib/providers";
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
  /**
   * The agent this control configures, when composer-scoped. Threaded so the
   * effort cycle is HIDDEN for org members who may not change the agent's model
   * config (Teams matrix v2) — effort is part of the model pin, so it hides
   * alongside the model selector. Omit outside an agent scope and it always
   * shows; single-player and owners/managers always show it.
   */
  agent?: Pick<Agent, "access"> | null;
}

/**
 * Reasoning-effort cycle button, rendered beside {@link ChatModelSelector} in
 * the composer. One click advances to the next level the active model accepts,
 * wrapping after the last (low → … → max → low). The icon's filled bars and
 * the label both track the level, so the control reads at a glance without a
 * menu. Renders nothing when the model has no effort control (e.g. Gemini), so
 * the composer row collapses cleanly.
 */
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
  // Hidden entirely for org members (effort is part of the model pin they may
  // not see), and for any model without effort levels (e.g. Gemini) so the
  // composer row collapses cleanly.
  if (!shouldShowModelSelector(capabilities, agent)) return null;
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

  // The current level (only when the stored value is one this model accepts)
  // and the level a click advances to, wrapping past the last back to the first.
  const activeLevel =
    effort && levels.includes(effort as EffortLevel)
      ? (effort as EffortLevel)
      : undefined;
  const nextLevel = nextEffort(levels, effort);

  const activeLabel = activeLevel
    ? labels[activeLevel]
    : t("modelSelector.effort");

  return (
    <button
      type="button"
      // Announce the value (the visible label alone reads as a bare "High").
      aria-label={
        activeLevel
          ? t("modelSelector.effortValue", { level: activeLabel })
          : t("modelSelector.effort")
      }
      title={
        activeLevel ? descriptions[activeLevel] : t("modelSelector.effort")
      }
      // Stop pointer events from bubbling — keeps the board detail panel from
      // reading the click as "click outside → close panel".
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (nextLevel) onSelect(nextLevel);
      }}
      className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      {/* Always render the full effort spectrum (filled to the active level)
          so the gauge looks identical across models — a 2-level model no longer
          renders as a lone short + tall bar. Cycling still uses the model's own
          `levels` above. */}
      <EffortIcon levels={EFFORT_ORDER} active={effort} className="size-3.5" />
      <span>{activeLabel}</span>
    </button>
  );
}
