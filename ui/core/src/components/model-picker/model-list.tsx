import { Command as CommandPrimitive } from "cmdk";
import { ModelRow } from "./model-row";
import type { ModelPickerModel } from "./types";

/** A flat group of model rows — used for both a provider's models (level 2) and
 *  the search results. Empty handling lives in the root so it can differ per
 *  mode ("no models" vs. "no search results"). */
export function ModelRows({
  scope,
  ariaLabel,
  models,
  query,
  selectedId,
  onSelect,
}: {
  /** cmdk value namespace so rows are unique across modes. */
  scope: string;
  ariaLabel: string;
  models: ModelPickerModel[];
  query: string;
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <CommandPrimitive.Group aria-label={ariaLabel}>
      {models.map((model) => (
        <ModelRow
          key={model.id}
          scope={scope}
          model={model}
          query={query}
          selected={model.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </CommandPrimitive.Group>
  );
}
