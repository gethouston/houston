import { Check, ChevronRight, Loader2 } from "lucide-react";
import type * as React from "react";
import { CommandItem } from "../command";
import { ProviderIcon } from "./provider-icon";
import type { ModelPickerLabels, ModelPickerProvider } from "./types";

/**
 * Level 1: the connected providers, in the shared dropdown idiom. Each row is a
 * `CommandItem` so ↑↓/Enter roving works; Enter (or click) drills into that
 * provider's models. A neutral loading state stands in for an empty list while
 * statuses resolve (#342 guard); a truly empty connected set shows the "no
 * providers" hint instead. A check marks the current provider; a trailing chevron
 * signals the drill-in to its models.
 */
export function ProviderList({
  providers,
  loading,
  selectedProviderId,
  labels,
  renderProviderIcon,
  onEnter,
}: {
  providers: ModelPickerProvider[];
  loading: boolean;
  selectedProviderId?: string;
  labels: ModelPickerLabels;
  renderProviderIcon?: (
    providerId: string,
    className?: string,
  ) => React.ReactNode;
  onEnter: (providerId: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
        {labels.loading}
      </div>
    );
  }
  if (providers.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground">
        {labels.noProviders}
      </div>
    );
  }
  return (
    <>
      {providers.map((provider) => (
        <CommandItem
          key={provider.id}
          value={provider.name}
          keywords={[provider.id]}
          onSelect={() => onEnter(provider.id)}
        >
          <ProviderIcon
            providerId={provider.id}
            name={provider.name}
            render={renderProviderIcon}
            className="size-4"
          />
          <span className="min-w-0 flex-1 truncate text-foreground">
            {provider.name}
          </span>
          {provider.id === selectedProviderId && (
            <Check className="size-4 shrink-0 text-foreground" />
          )}
          <ChevronRight className="size-4 shrink-0" />
        </CommandItem>
      ))}
    </>
  );
}
