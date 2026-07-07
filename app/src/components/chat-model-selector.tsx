import {
  ModelPicker,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import type { Agent } from "@houston-ai/engine-client";
import { ChevronDown } from "lucide-react";
import { useMemo } from "react";
import { useCapabilities } from "../hooks/use-capabilities";
import { useChatModelPicker } from "../hooks/use-chat-model-picker";
import { decodeModelPickerId } from "../lib/chat-model-picker-ids";
import {
  isModelAllowed,
  modelSelectorDecision,
} from "../lib/model-selector-lock";
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
   * surface (the composer). Threaded so the picker follows the Teams matrix:
   * single-player and managers/owners always see it; a multiplayer Teams member
   * also sees it (Change 3 reversed E7's hide-for-members), while a member on a
   * pre-Teams multiplayer host stays hidden. Omit outside an agent scope and the
   * picker always shows.
   */
  agent?: Pick<Agent, "access"> | null;
  /**
   * The agent's effective allowed-models ceiling (Teams E8): the option list is
   * clamped to it. `null`/`undefined` = no ceiling (every model). When it holds
   * exactly one model the picker renders that model read-only (still visible).
   */
  allowedModels?: string[] | null;
}

export function ChatModelSelector({
  provider,
  model,
  onSelect,
  open,
  onOpenChange,
  agent,
  allowedModels,
}: ChatModelSelectorProps) {
  const { capabilities } = useCapabilities();
  const { show } = modelSelectorDecision(capabilities, agent);
  const picker = useChatModelPicker({
    provider,
    model,
    onSelect,
    open,
    onOpenChange,
  });

  // Clamp the pickable set to the agent's allowed-models ceiling (Teams E8).
  // `allowedModels == null` = no ceiling (every model). Providers left with no
  // model drop out of the rail. `picker.models` is only built while the popover
  // is open, so this is an empty-in/empty-out no-op when the picker is closed.
  const models = useMemo(
    () =>
      allowedModels == null
        ? picker.models
        : picker.models.filter((m) =>
            isModelAllowed(allowedModels, decodeModelPickerId(m.id).model),
          ),
    [picker.models, allowedModels],
  );
  const providers = useMemo(() => {
    if (allowedModels == null) return picker.providers;
    const ids = new Set(models.map((m) => m.providerId));
    return picker.providers.filter((p) => ids.has(p.id));
  }, [picker.providers, models, allowedModels]);

  // A plain member on a pre-Teams multiplayer host never sees the agent's model:
  // the picker renders nothing. The hooks above still run so the rules-of-hooks
  // order stays stable across the show/hide flip.
  if (!show) return null;

  // Exactly one allowed model: the pick is fixed, so render it read-only (still
  // visible) rather than a one-row popover (contract Change 3).
  const readOnly = allowedModels != null && allowedModels.length === 1;

  return (
    // Stop pointer events from bubbling — prevents the board detail panel
    // from interpreting trigger clicks as "click outside → close panel".
    <fieldset
      className="contents border-0 p-0 m-0"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {readOnly ? (
        // The one allowed model, read-only: no dropdown affordance signals it is
        // fixed, and the visible label is its own accessible name.
        <div className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-muted-foreground">
          <span className="inline-flex size-3.5 items-center justify-center [&_svg]:size-full">
            <ProviderGlyph providerId={provider} />
          </span>
          <span>{picker.displayLabel}</span>
        </div>
      ) : (
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
              models={models}
              providers={providers}
              selectedId={picker.selectedId}
              catalogState={picker.catalogState}
              onSelect={picker.onSelect}
              onConnectMore={picker.onConnectMore}
              renderProviderIcon={picker.renderProviderIcon}
              labels={picker.labels}
              className="w-[380px]"
            />
          </PopoverContent>
        </Popover>
      )}
    </fieldset>
  );
}
