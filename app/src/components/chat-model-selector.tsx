import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
} from "@houston-ai/core";
import { tauriProvider, type ProviderStatus } from "../lib/tauri";
import {
  PROVIDERS,
  getProvider,
  getModel,
  getEffortLevels,
  type EffortLevel,
} from "../lib/providers";
import {
  ProviderModelGroup,
  EffortGroup,
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
  /**
   * Effective reasoning-effort for the active model. When `onEffortSelect`
   * is provided and the active model supports effort, the dropdown shows an
   * effort row with this value marked active.
   */
  effort?: string;
  /** Called when the user picks an effort level. Omit to hide the effort row. */
  onEffortSelect?: (effort: EffortLevel) => void;
}

export function ChatModelSelector({
  provider,
  model,
  onSelect,
  lockedProvider,
  effort,
  onEffortSelect,
}: ChatModelSelectorProps) {
  const { t } = useTranslation("chat");
  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});

  const loadStatuses = useCallback(async () => {
    const entries = await Promise.all(
      PROVIDERS.map(async (p) => [p.id, await tauriProvider.checkStatus(p.id)] as const),
    );
    setStatuses(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    loadStatuses();
  }, [loadStatuses]);

  const currentProvider = getProvider(provider);
  const currentModel = getModel(provider, model);
  const displayLabel = currentModel?.label ?? currentProvider?.subtitle ?? t("modelSelector.selectModel");
  // Effort levels are per-model (e.g. Sonnet has `max` but not `xhigh`).
  const effortLevels = getEffortLevels(provider, model);

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
    <div onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
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
            const status = statuses[prov.id];
            const connected = (status?.cli_installed && status?.authenticated) ?? false;
            // Hide disconnected providers that aren't active
            if (!connected && prov.id !== provider) return null;
            // When provider is locked AND still installed, only show the
            // locked provider's models. When the locked provider is
            // uninstalled, `effectiveLock` is null so other connected
            // providers stay visible — see the lock-override comment above.
            if (effectiveLock && prov.id !== effectiveLock) return null;
            return (
              <ProviderModelGroup
                key={prov.id}
                provider={prov}
                connected={connected}
                isActiveProvider={prov.id === provider}
                activeModel={prov.id === provider ? model : null}
                onSelect={onSelect}
                showSeparator={idx > 0 && !effectiveLock}
              />
            );
          })}
          {onEffortSelect && effortLevels.length > 0 && (
            <EffortGroup
              levels={effortLevels}
              active={effort}
              onSelect={onEffortSelect}
            />
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
