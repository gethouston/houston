import {
  ModelPicker,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import type { Agent } from "@houston-ai/engine-client";
import { ChevronDown } from "lucide-react";
import { useCapabilities } from "../hooks/use-capabilities";
import { useChatModelPicker } from "../hooks/use-chat-model-picker";
import { shouldShowModelSelector } from "../lib/model-selector-lock";
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
   * surface (the composer). Threaded so the picker is HIDDEN for org members
   * who may not change the agent's AI model (Teams matrix v2): a non-manager
   * never sees which model the agent uses. Omit outside an agent scope and the
   * picker always shows; single-player and owners/managers always show it.
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
  const { capabilities } = useCapabilities();
  const show = shouldShowModelSelector(capabilities, agent);
  const picker = useChatModelPicker({
    provider,
    model,
    onSelect,
    open,
    onOpenChange,
  });

  // A plain org member never sees the agent's model: the picker renders
  // nothing (the composer row collapses cleanly). The hooks above still run so
  // the rules-of-hooks order stays stable across the show/hide flip.
  if (!show) return null;

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
