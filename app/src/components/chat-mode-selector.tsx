import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import type { Agent } from "@houston-ai/engine-client";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, Handshake, Rocket, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { modelSelectorDecision } from "../lib/model-selector-lock";
import type { TurnMode } from "../lib/turn-mode";

interface ChatModeSelectorProps {
  /** Currently-pinned turn mode. */
  mode: TurnMode;
  /** Called when the user picks a mode. */
  onSelect: (mode: TurnMode) => void;
  /**
   * The agent this control configures, when composer-scoped. Threaded so the
   * Mode pill follows the same audience as the model + effort selectors: shown
   * for everyone in a Teams org and in single-player, hidden only for a member
   * on a pre-Teams multiplayer host. Omit outside an agent scope and it always
   * shows.
   */
  agent?: Pick<Agent, "access"> | null;
}

/** Coworker = execute (works with you, asks when unsure), Planner = plan
 *  (read-only, writes a plan), Autopilot = auto (fire-and-forget, no blocking
 *  tools). Wire values stay `execute`/`plan`/`auto`; only the labels change. */
const MODE_ICONS: Record<TurnMode, LucideIcon> = {
  execute: Handshake,
  plan: Target,
  auto: Rocket,
};

// Top→bottom as an autonomy dial: Planner (looks, doesn't touch) → Coworker
// (acts, asks when unsure) → Autopilot (acts and never stops to ask).
const MODE_ORDER: readonly TurnMode[] = ["plan", "execute", "auto"];

/**
 * "Mode" picker, rendered beside {@link ChatModelSelector} in the composer.
 * Three modes — Planner (read-only planning), Coworker (execute), and
 * Autopilot (auto, fire-and-forget) — each with an icon in a soft tile, a
 * name, and a one-line description. The trigger is the
 * same h-7 muted pill as the model + effort selectors; the menu matches the
 * model picker's card (rounded-2xl, bordered, shadowed, roomy rows). Hidden only
 * for a member on a pre-Teams multiplayer host (mirrors the other selectors);
 * otherwise always available.
 */
export function ChatModeSelector({
  mode,
  onSelect,
  agent,
}: ChatModeSelectorProps) {
  const { t } = useTranslation("chat");
  const { capabilities } = useCapabilities();
  if (!modelSelectorDecision(capabilities, agent).show) return null;

  const labels: Record<TurnMode, string> = {
    execute: t("modeSelector.coworker"),
    plan: t("modeSelector.planner"),
    auto: t("modeSelector.autopilot"),
  };
  const descriptions: Record<TurnMode, string> = {
    execute: t("modeSelector.coworkerDescription"),
    plan: t("modeSelector.plannerDescription"),
    auto: t("modeSelector.autopilotDescription"),
  };

  const ActiveIcon = MODE_ICONS[mode];

  return (
    // Stop pointer events from bubbling — keeps the board detail panel from
    // reading trigger clicks as "click outside → close panel".
    <fieldset
      className="contents border-0 p-0 m-0"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("modeSelector.modeValue", { mode: labels[mode] })}
            title={descriptions[mode]}
            className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-muted-foreground whitespace-nowrap hover:text-foreground hover:bg-accent transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ActiveIcon className="size-3.5" />
            <span>{labels[mode]}</span>
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        {/* Match the model picker card: rounded-2xl, hairline border, soft
            shadow, roomy 1.5 padding — not the default menu slab. */}
        <DropdownMenuContent
          align="start"
          sideOffset={6}
          className="w-[300px] rounded-2xl border-border p-1.5 shadow-lg"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {MODE_ORDER.map((m) => {
            const Icon = MODE_ICONS[m];
            const active = m === mode;
            return (
              <DropdownMenuItem
                key={m}
                onSelect={() => onSelect(m)}
                className="items-center gap-3 rounded-xl px-2.5 py-2.5"
              >
                <Icon className="size-4 shrink-0 text-foreground" />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium text-foreground">
                    {labels[m]}
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {descriptions[m]}
                  </span>
                </div>
                {active && (
                  <Check className="size-4 shrink-0 text-foreground" />
                )}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </fieldset>
  );
}
