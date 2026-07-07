import { Command as CommandPrimitive } from "cmdk";
import { Check } from "lucide-react";
import { cn } from "../../utils";
import { HighlightedText } from "../highlighted-text";
import { matchRange } from "./catalog";
import type { ModelPickerModel } from "./types";

/** A single selectable model row: name, an optional one-line description, and a
 *  check on the selected model. Nothing else. */
export function ModelRow({
  scope,
  model,
  query,
  selected,
  onSelect,
}: {
  /** Namespaces the cmdk `value` so the same model can appear in two scopes
   *  (e.g. search vs. a provider list) without a duplicate-key collision. */
  scope: string;
  model: ModelPickerModel;
  query: string;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const range = matchRange(model.name, query);
  return (
    <CommandPrimitive.Item
      value={`${scope}:${model.id}`}
      keywords={[model.name, model.providerId]}
      onSelect={() => onSelect(model.id)}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 outline-none",
        "data-[selected=true]:bg-accent",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">
          <HighlightedText
            text={model.name}
            ranges={range ? [range] : undefined}
            markClassName="bg-accent text-foreground"
          />
        </div>
        {model.description && (
          <div className="truncate text-xs text-muted-foreground">
            {model.description}
          </div>
        )}
      </div>
      {selected && <Check className="size-4 shrink-0 text-foreground" />}
    </CommandPrimitive.Item>
  );
}
