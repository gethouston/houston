import { ModelRow } from "./model-row";
import type { ModelPickerModel } from "./types";

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
