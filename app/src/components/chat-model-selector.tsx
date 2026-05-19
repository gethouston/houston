import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@houston-ai/core";
import { tauriProvider, type ProviderStatus } from "../lib/tauri";
import { PROVIDERS, getProvider, getModel, type ProviderInfo } from "../lib/providers";
import { ClaudeLogo, OpenAILogo, GeminiLogo } from "./shell/provider-logos";

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

export function ChatModelSelector({ provider, model, onSelect, lockedProvider }: ChatModelSelectorProps) {
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

  // Honour `lockedProvider` only when that provider is still installed.
  // If the chat was created against a provider that the engine now
  // reports as missing (e.g. Gemini on a Windows install that does not
  // ship the binary in v1), the user must be able to switch to an
  // installed alternative — otherwise every send routes back to the
  // missing CLI and fails. Drop the lock in that case so other
  // connected providers appear in the dropdown.
  const lockedStatus = lockedProvider ? statuses[lockedProvider] : undefined;
  const lockedProviderInstalled = lockedStatus?.cli_installed ?? true;
  const effectiveLock = lockedProvider && lockedProviderInstalled ? lockedProvider : null;

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
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ProviderModelGroup({
  provider,
  connected,
  isActiveProvider,
  activeModel,
  onSelect,
  showSeparator,
}: {
  provider: ProviderInfo;
  connected: boolean;
  isActiveProvider: boolean;
  activeModel: string | null;
  onSelect: (provider: string, model: string) => void;
  showSeparator: boolean;
}) {
  const { t } = useTranslation("chat");
  return (
    <>
      {showSeparator && <DropdownMenuSeparator />}
      <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
        <ProviderIcon providerId={provider.id} className="size-3.5" />
        {provider.name}
        {!connected && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto">{t("modelSelector.notConnected")}</span>
        )}
      </DropdownMenuLabel>
      {provider.models.map((m) => {
        const isActive = isActiveProvider && m.id === activeModel;
        return (
          <DropdownMenuItem
            key={m.id}
            disabled={!connected}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(provider.id, m.id);
            }}
            className="flex items-start gap-2.5 py-1.5"
          >
            <div className="w-4 shrink-0 mt-0.5 flex justify-center">
              {isActive && <Check className="h-3.5 w-3.5 text-foreground" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm">{m.label}</div>
              <div className="text-xs text-muted-foreground leading-snug">{m.description}</div>
            </div>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

/**
 * Exhaustive icon dispatch for active providers. Mirrors the `ProviderLogo`
 * switch in provider-cards.tsx. The wrapper div sizes the underlying logo
 * (which renders at its native viewBox); the chat panel uses size-3.5 vs
 * the provider picker's size-5.
 */
function ProviderIcon({ providerId, className }: { providerId: string; className?: string }) {
  return (
    <span className={className} style={{ display: "inline-flex" }}>
      {iconFor(providerId)}
    </span>
  );
}

function iconFor(providerId: string) {
  switch (providerId) {
    case "anthropic":
      return <ClaudeLogo className="size-full" />;
    case "openai":
      return <OpenAILogo className="size-full" />;
    case "gemini":
      return <GeminiLogo className="size-full" />;
    default:
      return null;
  }
}
