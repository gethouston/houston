import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@houston-ai/core";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProviderStatuses } from "../hooks/use-provider-statuses";
import {
  providerPickerState,
  shouldShowProviderInPicker,
} from "../lib/model-picker";
import { getModel, getProvider, PROVIDERS } from "../lib/providers";
import { ProviderIcon, ProviderModelGroup } from "./chat-model-selector-parts";

interface ChatModelSelectorProps {
  /** Current provider id (from agent config / per-mission override). */
  provider: string;
  /** Current model id. */
  model: string;
  /**
   * Called when the user picks a provider + model. The provider is never
   * locked: switching to a different provider mid-conversation is supported
   * (the runtime resolves the provider per turn and continues the same
   * conversation).
   */
  onSelect: (provider: string, model: string) => void;
}

export function ChatModelSelector({
  provider,
  model,
  onSelect,
}: ChatModelSelectorProps) {
  const { t } = useTranslation("chat");
  const { statuses, isLoading } = useProviderStatuses();

  const currentProvider = getProvider(provider);
  const currentModel = getModel(provider, model);
  const displayLabel =
    currentModel?.label ??
    // A local OpenAI-compatible model isn't in the static catalog, so show its
    // raw id rather than falling through to the provider subtitle.
    (model || undefined) ??
    currentProvider?.subtitle ??
    t("modelSelector.selectModel");

  return (
    // Stop pointer events from bubbling — prevents the board detail panel
    // from interpreting dropdown clicks as "click outside → close panel".
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
