import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@houston-ai/core";
import { PROVIDERS, getProvider, getModel } from "../lib/providers";
import { useOpenRouterModels } from "../hooks/use-openrouter-models";
import {
  providerPickerState,
  shouldShowProviderInPicker,
} from "../lib/model-picker";
import { useProviderStatuses } from "../hooks/use-provider-statuses";
import {
  ProviderModelGroup,
  ProviderIcon,
} from "./chat-model-selector-parts";

interface ChatModelSelectorProps {
  /** Current provider id (from workspace/agent config). */
  provider: string;
  /** Current model id. */
  model: string;
  /** Called when user picks a provider + model. */
  onSelect: (provider: string, model: string) => void;
  /**
   * When set, the provider is locked (conversation already started).
   * The user can still switch models within this provider, but not
   * change to a different provider.
   */
  lockedProvider?: string | null;
}

export function ChatModelSelector({
  provider,
  model,
  onSelect,
  lockedProvider,
}: ChatModelSelectorProps) {
  const { t } = useTranslation("chat");
  const { statuses, isLoading } = useProviderStatuses();
  const { models: openRouterModels } = useOpenRouterModels();

  const currentProvider = getProvider(provider);
  const currentModel = getModel(provider, model);
  const displayLabel =
    currentModel?.label ?? model ?? currentProvider?.subtitle ?? t("modelSelector.selectModel");
  const displayTitle = currentModel?.label ?? model ?? displayLabel;

  // Honour `lockedProvider` only when it points at a currently-active
  // provider that the engine reports as installed. Two cases drop the
  // lock so the user can switch instead of being stuck:
  //
  //   * The locked provider is in `COMING_SOON_PROVIDERS` (or unknown),
  //     so `getProvider` returns undefined. This happens when Gemini is
  //     paused in the catalog but a stored activity still references
  //     it.
  //   * The locked provider is in `PROVIDERS` but the engine reports
  //     `cli_installed=false` (binary missing on this platform).
  //
  // In both cases every send would route to a provider the user cannot
  // currently invoke, so the dropdown must expose installed
  // alternatives instead of pinning the broken choice.
  const lockedProviderEntry = lockedProvider ? getProvider(lockedProvider) : undefined;
  const lockedStatus = lockedProvider ? statuses[lockedProvider] : undefined;
  const lockedProviderInstalled = lockedStatus?.cli_installed ?? true;
  const effectiveLock =
    lockedProvider && lockedProviderEntry && lockedProviderInstalled
      ? lockedProvider
      : null;

  return (
    // Stop pointer events from bubbling — prevents the board detail panel
    // from interpreting dropdown clicks as "click outside → close panel".
    <div
      className="min-w-0 max-w-[11rem] shrink"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={displayTitle}
            className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring min-w-0 max-w-full"
          >
            <ProviderIcon providerId={provider} className="size-3.5 shrink-0" />
            <span className="truncate">{displayLabel}</span>
            <ChevronDown className="size-3 opacity-60 shrink-0" />
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
            // providers. A lock (conversation already started) still shows
            // only the locked provider — see the lock-override comment above.
            if (
              !shouldShowProviderInPicker({
                providerId: prov.id,
                state,
                isActiveProvider,
                effectiveLock,
              })
            ) {
              return null;
            }
            const providerForList =
              prov.id === "openrouter" ? { ...prov, models: openRouterModels } : prov;
            return (
              <ProviderModelGroup
                key={prov.id}
                provider={providerForList}
                state={state}
                isActiveProvider={isActiveProvider}
                activeModel={isActiveProvider ? model : null}
                onSelect={onSelect}
                showSeparator={idx > 0 && !effectiveLock}
              />
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
