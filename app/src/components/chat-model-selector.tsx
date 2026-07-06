import {
  ModelPicker,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import type { Agent } from "@houston-ai/engine-client";
import { ChevronDown, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { useChatModelPicker } from "../hooks/use-chat-model-picker";
import { isModelSelectorLocked } from "../lib/model-selector-lock";
import { ProviderConnectionDialogs } from "./ai-hub/provider-connection-dialogs";
import { ProviderGlyph } from "./shell/provider-logos";

interface ChatModelSelectorProps {
  /** Current provider id (from agent config / per-mission override). */
  provider: string;
  /** Current model id. */
  model: string;
  /**
   * Called when the user picks a provider + model. The provider is never
   * locked: switching to a different provider mid-conversation is supported.
   * The runtime resolves the provider per turn and continues the same
   * conversation, and the consumer (`use-agent-chat-panel`) stages the handoff
   * so the engine carries context across.
   */
  onSelect: (provider: string, model: string) => void;
  /**
   * Optional controlled open state so another surface can pop the picker open —
   * e.g. a `model_unavailable` error card's "Pick another model" CTA. Omit both
   * to leave the picker uncontrolled (its default trigger-click behavior).
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /**
   * The agent this selector configures, when rendered in an agent-scoped
   * surface (the composer). Threaded so the picker can LOCK for org members
   * who may not change the agent's AI model (Teams matrix v2): a non-manager
   * sees the pinned provider/model read-only. Omit outside an agent scope and
   * the picker never locks; single-player is never locked.
   */
  agent?: Pick<Agent, "access"> | null;
}

export function ChatModelSelector({
  provider,
  model,
  onSelect,
  open,
  onOpenChange,
  agent,
}: ChatModelSelectorProps) {
  const { t: tTeams } = useTranslation("teams");
  const { capabilities } = useCapabilities();
  const locked = isModelSelectorLocked(capabilities, agent);
  const picker = useChatModelPicker({
    provider,
    model,
    onSelect,
    open,
    onOpenChange,
  });

  if (locked) {
    // Members see WHICH model the agent uses (a feature, not a leak) but can't
    // change it: no picker, no provider/effort switch. `aria-disabled` (not the
    // native `disabled` attribute) keeps the trigger focusable so the tooltip
    // reason still reaches keyboard + screen-reader users.
    return (
      <fieldset
        className="contents border-0 p-0 m-0"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-disabled="true"
              onClick={(e) => e.preventDefault()}
              className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-muted-foreground cursor-not-allowed opacity-80 outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <span className="inline-flex size-3.5 items-center justify-center [&_svg]:size-full">
                <ProviderGlyph providerId={provider} />
              </span>
              <span>{picker.displayLabel}</span>
              <Lock className="size-3 opacity-60" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{tTeams("model.lockedTooltip")}</TooltipContent>
        </Tooltip>
      </fieldset>
    );
  }

  return (
    // Stop pointer events from bubbling — prevents the board detail panel
    // from interpreting trigger clicks as "click outside → close panel".
    <fieldset
      className="contents border-0 p-0 m-0"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Popover open={picker.isOpen} onOpenChange={picker.setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <span className="inline-flex size-3.5 items-center justify-center [&_svg]:size-full">
              <ProviderGlyph providerId={provider} />
            </span>
            <span>{picker.displayLabel}</span>
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-auto border-0 bg-transparent p-0 shadow-none"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <ModelPicker
            models={picker.models}
            providers={picker.providers}
            favorites={picker.favorites}
            recents={picker.recents}
            selectedId={picker.selectedId}
            defaultProviderId={picker.defaultProviderId}
            catalogState={picker.catalogState}
            onSelect={picker.onSelect}
            onToggleFavorite={picker.onToggleFavorite}
            onConnect={picker.onConnect}
            renderProviderIcon={picker.renderProviderIcon}
            labels={picker.labels}
            className="w-[600px]"
          />
        </PopoverContent>
      </Popover>
      <ProviderConnectionDialogs {...picker.dialogProps} />
    </fieldset>
  );
}
