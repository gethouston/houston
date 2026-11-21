export interface PickerModelRow {
  id: string;
  label: string;
  description: string;
}

export function pickerModelRows(
  catalogModels: readonly PickerModelRow[],
  runtimeModelId: string | undefined,
  subtitle: string,
): PickerModelRow[] {
  if (catalogModels.length > 0) return [...catalogModels];
  return runtimeModelId
    ? [{ id: runtimeModelId, label: runtimeModelId, description: subtitle }]
    : [];
}

export function withAccountLabel(
  description: string,
  accountLabel: string | undefined,
): string {
  if (!accountLabel) return description;
  return description ? `${description} · ${accountLabel}` : accountLabel;
}
