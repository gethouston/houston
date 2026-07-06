import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@houston-ai/core";
import type { Agent } from "@houston-ai/engine-client";
import { ChevronDown, Lock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCapabilities } from "../hooks/use-capabilities";
import { useProviderStatuses } from "../hooks/use-provider-statuses";
import { newEngineActive } from "../lib/engine";
import {
  providerPickerState,
  shouldShowProviderInPicker,
} from "../lib/model-picker";
import { isModelSelectorLocked } from "../lib/model-selector-lock";
import { osIsTauri } from "../lib/os-bridge";
import {
  EMPTY_PROVIDER_CAPABILITIES,
  getModel,
  getProvider,
  getVisibleProviders,
  PROVIDERS,
} from "../lib/providers";
import { ProviderIcon, ProviderModelGroup } from "./chat-model-selector-parts";

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
   * to leave the dropdown uncontrolled (its default trigger-click behavior).
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
  const { t } = useTranslation("chat");
  const { t: tTeams } = useTranslation("teams");
  const { statuses, isLoading } = useProviderStatuses();
  const { capabilities } = useCapabilities();
  const locked = isModelSelectorLocked(capabilities, agent);
  const newEngine = newEngineActive();
  const providerCapabilities =
    capabilities ?? (newEngine ? EMPTY_PROVIDER_CAPABILITIES : undefined);
  const visibleProviders = getVisibleProviders({
    newEngine,
    desktop: osIsTauri(),
    capabilities: providerCapabilities,
  });

  const currentProvider = getProvider(provider);
  const currentModel = getModel(provider, model);
  const displayLabel =
    currentModel?.label ??
    // A local OpenAI-compatible model isn't in the static catalog, so show the
    // engine-reported configured model id (then the raw selection) rather than
    // falling through to the provider subtitle.
    statuses[provider]?.active_model ??
    (model || undefined) ??
    currentProvider?.subtitle ??
    t("modelSelector.selectModel");

  if (locked) {
    // Members see WHICH model the agent uses (a feature, not a leak) but can't
    // change it: no dropdown, no provider/effort switch. `aria-disabled` (not
    // the native `disabled` attribute) keeps the trigger focusable so the
    // tooltip reason still reaches keyboard + screen-reader users.
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
              <ProviderIcon providerId={provider} className="size-3.5" />
              <span>{displayLabel}</span>
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
    // from interpreting dropdown clicks as "click outside → close panel".
    <fieldset
      className="contents border-0 p-0 m-0"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <ProviderIcon providerId={provider} className="size-3.5" />
            <span>{displayLabel}</span>
            <ChevronDown className="size-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-64"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {PROVIDERS.map((prov, idx) => {
            if (!visibleProviders.some((p) => p.id === prov.id)) return null;
            const state = providerPickerState(statuses[prov.id], isLoading);
            const isActiveProvider = prov.id === provider;
            // Keep every provider visible while statuses are still loading so
            // the list doesn't collapse to a single "Not connected" entry
            // (issue #342); once known, hide disconnected non-active
            // providers. Every connected provider stays selectable — switching
            // provider mid-conversation is supported.
            if (
              !shouldShowProviderInPicker({
                providerId: prov.id,
                state,
                isActiveProvider,
              })
            ) {
              return null;
            }
            return (
              <ProviderModelGroup
                key={prov.id}
                provider={prov}
                state={state}
                isActiveProvider={isActiveProvider}
                activeModel={isActiveProvider ? model : null}
                runtimeModelId={statuses[prov.id]?.active_model}
                onSelect={onSelect}
                showSeparator={idx > 0}
              />
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </fieldset>
  );
}
