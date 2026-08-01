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

/**
 * Name the ACCOUNT a model runs on at the end of its row subtitle (HOU-976 §6):
 * "Best for complex work · your account".
 *
 * In a team space a provider may be connected twice — the member's own account
 * and the team's shared one — and which of them answered is the difference
 * between a limit that is theirs to wait out and one to raise with an admin. The
 * label sits AFTER the model's own description so the reading order stays
 * model-first; provenance is the qualifier, not the headline.
 *
 * `accountLabel` is undefined on every deployment that never said (desktop,
 * self-host, a personal space, a gateway predating the field), and then the
 * subtitle is returned verbatim — the picker reads exactly as it did before this
 * feature. i18n-free by design: the caller passes the already-translated label.
 */
export function withAccountLabel(
  description: string,
  accountLabel: string | undefined,
): string {
  if (!accountLabel) return description;
  return description ? `${description} · ${accountLabel}` : accountLabel;
}
