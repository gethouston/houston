/**
 * Pure model-row helpers for the chat model picker (ChatModelSelector).
 *
 * Split out from the component so the row-building logic is unit-testable
 * without a React renderer (the app has no component test runner — see
 * `app/tests/*.test.ts` for the node:test pattern) and so the container stays
 * under the file-size budget.
 *
 * The provider CONNECTION derivation used to live here too, in a copy that
 * disagreed with the AI hub's. It now has exactly one home for every surface:
 * `provider-connection.ts` (HOU-979).
 */

/** A model row rendered under a provider in the chat picker. */
export interface PickerModelRow {
  id: string;
  label: string;
  description: string;
}

/**
 * The model rows to render under a provider in the chat picker.
 *
 * A catalogued provider shows its static catalog. A catalog-less provider — the
 * local OpenAI-compatible one, whose model is user-supplied and reported by the
 * engine, not the static catalog — shows that single `runtimeModelId`, or
 * nothing when the engine hasn't reported one yet (so the caller skips the group
 * rather than render a dangling, empty header). This is what makes a local model
 * connected from Settings appear + be selectable in the chat picker.
 */
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
