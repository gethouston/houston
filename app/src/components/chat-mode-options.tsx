/**
 * The three turn modes as the mode picker lists them, shared by its desktop
 * menu and its phone sheet so the two never drift: the order, each mode's
 * icon, its authored copy, and the one row body (icon, name, description,
 * check when active).
 */

import {
  Check,
  Handshake,
  ListTodo,
  type LucideIcon,
  Rocket,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TurnMode } from "../lib/turn-mode";

/** Ask first = execute (gets things done, asks before sensitive actions),
 *  Planner = plan (read-only, writes a plan), Autopilot = auto (fire-and-forget,
 *  no blocking tools). Wire values stay `execute`/`plan`/`auto`; only the labels
 *  change. */
export const MODE_ICONS: Record<TurnMode, LucideIcon> = {
  execute: Handshake,
  plan: ListTodo,
  auto: Rocket,
};

// Top→bottom as an autonomy dial: Planner (looks, doesn't touch) → Ask first
// (acts, asks before sensitive actions) → Autopilot (acts and never stops to ask).
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
