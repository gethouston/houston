import { Input } from "@houston-ai/core";
import { Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import type { CatalogModel } from "../../lib/ai-hub/catalog-types";
import { searchModels } from "../../lib/ai-hub/search";
import type { ProviderInfo } from "../../lib/providers";
import { formatPrice } from "./format.ts";
import { ContextChip, ReasoningBadge } from "./hub-badges.tsx";
import { offerForProvider } from "./provider-grouping";

interface ProviderModelListProps {
  models: CatalogModel[];
  /** The card whose offer supplies each row's price / context. */
  provider: ProviderInfo;
  onOpenModel: (key: string) => void;
  searchLabel: string;
}

/**
 * The searchable model list inside a provider detail. Each row opens the
 * cross-provider model detail (`onOpenModel(key)`). Price and context come
 * from THIS provider's offer for the model; subscription offers show no price.
 */
export function ProviderModelList({
  models,
  provider,
  onOpenModel,
  searchLabel,
}: ProviderModelListProps) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const visible = searchModels(models, deferred);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchLabel}
          aria-label={searchLabel}
          className="pl-9"
        />
      </div>
      <ul className="flex flex-col gap-1">
        {visible.map((model) => (
          <ModelRow
            key={model.key}
            model={model}
            provider={provider}
            onOpen={() => onOpenModel(model.key)}
          />
        ))}
      </ul>
    </div>
  );
}

function ModelRow({
  model,
  provider,
  onOpen,
}: {
  model: CatalogModel;
  provider: ProviderInfo;
  onOpen: () => void;
}) {
  const offer = offerForProvider(model, provider);
  const context = offer?.context ?? model.context;
  const price =
    offer && !offer.subscription && offer.costInput != null
      ? formatPrice(offer.costInput)
      : null;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:bg-secondary"
      >
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
          {model.name}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {context != null && <ContextChip tokens={context} />}
          {model.reasoning && <ReasoningBadge />}
          {price != null && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {price}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
