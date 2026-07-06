import {
  cn,
  ModelPicker,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@houston-ai/core";
import { ChevronDown } from "lucide-react";
import { useChatModelPicker } from "../../hooks/use-chat-model-picker";
import { getProvider } from "../../lib/providers";
import { ProviderConnectionDialogs } from "../ai-hub/provider-connection-dialogs";
import { ProviderGlyph } from "./provider-logos";

/**
 * Model selector for the agent-creation surfaces (naming step, AI-assist
 * step, import wizard): the same catalog-backed `ModelPicker` the chat
 * composer uses — search, favorites, provider rail, connect flow — behind a
 * full-width two-line trigger that fits the creation form, and sized down
 * from the chat popover so it doesn't dwarf the dialog.
 */
export function CreationModelSelector({
  provider,
  model,
  onSelect,
}: {
  provider: string;
  model: string;
  onSelect: (provider: string, model: string) => void;
}) {
  const picker = useChatModelPicker({ provider, model, onSelect });
  const providerName = getProvider(provider)?.name;

  return (
    <>
      <Popover open={picker.isOpen} onOpenChange={picker.setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left",
              picker.isOpen
                ? "border-foreground/20 bg-secondary"
                : "border-border hover:border-foreground/15 hover:bg-accent/50",
            )}
          >
            <span className="inline-flex size-5 shrink-0 items-center justify-center [&_svg]:size-full">
              <ProviderGlyph providerId={provider} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium truncate">
                {picker.displayLabel}
              </span>
              {providerName && (
                <span className="block text-xs text-muted-foreground truncate">
                  {providerName}
                </span>
              )}
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                picker.isOpen && "rotate-180",
              )}
            />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="center"
          className="w-auto border-0 bg-transparent p-0 shadow-none"
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <ModelPicker
            models={picker.models}
            providers={picker.providers}
            favorites={picker.favorites}
            recents={picker.recents}
            selectedId={picker.selectedId}
            catalogState={picker.catalogState}
            onSelect={picker.onSelect}
            onToggleFavorite={picker.onToggleFavorite}
            onConnect={picker.onConnect}
            renderProviderIcon={picker.renderProviderIcon}
            labels={picker.labels}
            className="h-[440px] w-[480px]"
          />
        </PopoverContent>
      </Popover>
      <ProviderConnectionDialogs {...picker.dialogProps} />
    </>
  );
}
