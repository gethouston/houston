import { ModelRow } from "./model-row";
import type { ModelPickerModel } from "./types";

/** A flat list of model rows for a provider's models (level 2). Empty handling
 *  lives in the root's `CommandEmpty` so it can differ per mode. */
export function ModelRows({
  models,
  selectedId,
  onSelect,
}: {
  models: ModelPickerModel[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      {models.map((model) => (
        <ModelRow
          key={model.id}
          model={model}
          selected={model.id === selectedId}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}
