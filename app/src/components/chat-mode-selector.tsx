import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import type { Agent } from "@houston-ai/engine-client";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronDown, ClipboardList, MessageSquare } from "lucide-react";
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

const MODE_ICONS: Record<TurnMode, LucideIcon> = {
  execute: MessageSquare,
  plan: ClipboardList,
};

const MODE_ORDER: readonly TurnMode[] = ["execute", "plan"];

/**
 * "Mode" dropdown, rendered beside {@link ChatModelSelector} in the composer.
 * Two entries — Chat (execute) and Plan (read-only planning) — each with an
 * icon and a one-line description. The trigger pill shows the active mode's
 * icon + label so the row reads at a glance. Hidden only for a member on a
 * pre-Teams multiplayer host (mirrors the model + effort selectors); otherwise
 * always available.
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
    execute: t("modeSelector.chat"),
    plan: t("modeSelector.plan"),
  };
  const descriptions: Record<TurnMode, string> = {
    execute: t("modeSelector.chatDescription"),
    plan: t("modeSelector.planDescription"),
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
            className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ActiveIcon className="size-3.5" />
            <span>{labels[mode]}</span>
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[300px]"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {MODE_ORDER.map((m) => {
            const Icon = MODE_ICONS[m];
            const active = m === mode;
            return (
              <DropdownMenuItem
                key={m}
                onSelect={() => onSelect(m)}
                className="items-start gap-2.5 py-2"
              >
                <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                    {labels[m]}
                    {active && <Check className="size-3.5 text-primary" />}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {descriptions[m]}
                  </span>
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </fieldset>
  );
}
