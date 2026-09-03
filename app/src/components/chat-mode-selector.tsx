import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  ResponsivePopover,
  ResponsivePopoverContent,
  ResponsivePopoverTrigger,
  useIsMobile,
} from "@houston-ai/core";
import type { Agent } from "@houston-ai/engine-client";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { modelSelectorDecision } from "../lib/model-selector-lock";
import type { TurnMode } from "../lib/turn-mode";
import {
  MODE_ICONS,
  MODE_ORDER,
  ModeOptionBody,
  useModeCopy,
} from "./chat-mode-options";

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

/**
 * "Mode" picker, rendered beside {@link ChatModelSelector} in the composer.
 * Three modes — Planner (read-only planning), Ask first (execute), and
 * Autopilot (auto, fire-and-forget) — each with an icon in a soft tile, a
 * name, and a one-line description. The trigger is the same h-7 muted pill as
 * the model + effort selectors. On desktop the menu matches the model picker's
 * card (rounded-2xl, bordered, shadowed, roomy rows); on the phone the same
 * rows open in a bottom sheet, since an anchored menu has no room above a
 * composer that sits on the keyboard. Hidden only for a member on a pre-Teams
 * multiplayer host (mirrors the other selectors); otherwise always available.
 */
export function ChatModeSelector({
  mode,
  onSelect,
  agent,
}: ChatModeSelectorProps) {
  const { t } = useTranslation("chat");
  const { capabilities } = useCapabilities();
  const isMobile = useIsMobile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const { labels, descriptions } = useModeCopy();
  if (!modelSelectorDecision(capabilities, agent).show) return null;

  const ActiveIcon = MODE_ICONS[mode];
  const trigger = (
    <button
      type="button"
      aria-label={t("modeSelector.modeValue", { mode: labels[mode] })}
      title={descriptions[mode]}
      className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-ink-muted whitespace-nowrap hover:text-ink hover:bg-hover transition-colors outline-none focus-visible:ring-1 focus-visible:ring-focus"
    >
      <ActiveIcon className="size-3.5" />
      <span>{labels[mode]}</span>
      <ChevronDown className="hidden md:block size-3 opacity-60" />
    </button>
  );

  return (
    // Stop pointer events from bubbling — keeps the board detail panel from
    // reading trigger clicks as "click outside → close panel".
    <fieldset
      className="contents border-0 p-0 m-0"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {isMobile ? (
        <ResponsivePopover open={sheetOpen} onOpenChange={setSheetOpen}>
          <ResponsivePopoverTrigger asChild>{trigger}</ResponsivePopoverTrigger>
          <ResponsivePopoverContent title={t("modeSelector.mode")}>
            <div className="flex flex-col gap-0.5 px-2.5 pb-2">
              {MODE_ORDER.map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={m === mode}
                  onClick={() => {
                    onSelect(m);
                    setSheetOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors active:bg-hover"
                >
                  <ModeOptionBody mode={m} active={m === mode} />
                </button>
              ))}
            </div>
          </ResponsivePopoverContent>
        </ResponsivePopover>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
          {/* Match the model picker card: rounded-2xl, hairline border, soft
              shadow, roomy 1.5 padding — not the default menu slab. */}
          <DropdownMenuContent
            align="start"
            sideOffset={6}
            className="w-[300px] rounded-2xl border-line p-1.5 shadow-lg"
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            {MODE_ORDER.map((m) => (
              <DropdownMenuItem
                key={m}
                onSelect={() => onSelect(m)}
                className="items-center gap-3 rounded-xl px-2.5 py-2.5"
              >
                <ModeOptionBody mode={m} active={m === mode} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </fieldset>
  );
}
