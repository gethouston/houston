import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@houston-ai/core";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ProviderPickerState } from "../lib/model-picker";
import type { ProviderInfo } from "../lib/providers";
import { ClaudeLogo, OpenAILogo } from "./shell/provider-logos";

/**
 * Presentational sub-parts for {@link ChatModelSelector}. Split out so the
 * stateful container stays under the file-size budget; these are dumb
 * render helpers driven entirely by props.
 */

export function ProviderModelGroup({
  provider,
  state,
  isActiveProvider,
  activeModel,
  onSelect,
  showSeparator,
}: {
  provider: ProviderInfo;
  state: ProviderPickerState;
  isActiveProvider: boolean;
  activeModel: string | null;
  onSelect: (provider: string, model: string) => void;
  showSeparator: boolean;
}) {
  const { t } = useTranslation("chat");
  const connected = state === "connected";
  return (
    <>
      {showSeparator && <DropdownMenuSeparator />}
      <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground font-normal">
        <ProviderIcon providerId={provider.id} className="size-3.5" />
        {provider.name}
        {state === "checking" && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto">
            {t("modelSelector.checking")}
          </span>
        )}
        {state === "disconnected" && (
          <span className="text-[10px] text-muted-foreground/60 ml-auto">
            {t("modelSelector.notConnected")}
          </span>
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
              <div className="text-xs text-muted-foreground leading-snug">
                {m.description}
              </div>
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
export function ProviderIcon({
  providerId,
  className,
}: {
  providerId: string;
  className?: string;
}) {
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
    default:
      return null;
  }
}
