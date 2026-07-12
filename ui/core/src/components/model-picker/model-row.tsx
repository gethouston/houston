import { Check } from "lucide-react";
import { CommandItem } from "../command";
import type { ModelPickerModel } from "./types";

/** A single selectable model row in the shared dropdown idiom: name, an optional
 *  one-line description, and a check on the selected model. The cmdk `value` is
 *  the model id (unique — display names may collide); the name rides along in
 *  `keywords` so the in-dropdown search matches it. */
export function ModelRow({
  model,
  selected,
  onSelect,
}: {
  model: ModelPickerModel;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <CommandItem
      value={model.id}
      keywords={[model.name, model.providerId]}
      onSelect={() => onSelect(model.id)}
    >
      <div className="min-w-0 flex-1">
        <div className="truncate text-ink">{model.name}</div>
        {model.description && (
          <div className="truncate text-xs text-ink-muted">
            {model.description}
          </div>
        )}
      </div>
      {selected && <Check className="size-4 shrink-0 text-ink" />}
    </CommandItem>
  );
}
