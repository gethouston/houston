import {
  Check,
  Handshake,
  ListTodo,
  type LucideIcon,
  Rocket,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TurnMode } from "../lib/turn-mode";

export const MODE_ICONS: Record<TurnMode, LucideIcon> = {
  execute: Handshake,
  plan: ListTodo,
  auto: Rocket,
};

export const MODE_ORDER: readonly TurnMode[] = ["plan", "execute", "auto"];

export function useModeCopy() {
  const { t } = useTranslation("chat");
  const labels: Record<TurnMode, string> = {
    execute: t("modeSelector.askFirst"),
    plan: t("modeSelector.planner"),
    auto: t("modeSelector.autopilot"),
  };
  const descriptions: Record<TurnMode, string> = {
    execute: t("modeSelector.askFirstDescription"),
    plan: t("modeSelector.plannerDescription"),
    auto: t("modeSelector.autopilotDescription"),
  };
  return { labels, descriptions };
}

export function ModeOptionBody({
  mode,
  active,
}: {
  mode: TurnMode;
  active: boolean;
}) {
  const { labels, descriptions } = useModeCopy();
  const Icon = MODE_ICONS[mode];
  return (
    <>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <Icon className="size-4 shrink-0 text-ink" />
          {labels[mode]}
        </span>
        <span className="line-clamp-2 text-xs text-ink-muted">
          {descriptions[mode]}
        </span>
      </div>
      {active && <Check className="size-4 shrink-0 text-ink" />}
    </>
  );
}
