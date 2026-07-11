/**
 * Pure two-level navigation reducer for the model picker. Level 1 is the
 * connected-provider list; level 2 is one provider's models. The `query` lives
 * alongside the level and drives cmdk's built-in filter over the CURRENT level's
 * rows (it never crosses levels); entering a provider or stepping back clears it
 * so each screen opens unfiltered. Kept React-free so it can be unit-tested
 * directly.
 */

export type ModelPickerLevel =
  | { level: "providers" }
  | { level: "models"; providerId: string };

export interface ModelPickerNav {
  query: string;
  view: ModelPickerLevel;
}

export type ModelPickerNavAction =
  | { type: "setQuery"; query: string }
  | { type: "enterProvider"; providerId: string }
  | { type: "back" };

export function initialNav(): ModelPickerNav {
  return { query: "", view: { level: "providers" } };
}

export function navReducer(
  state: ModelPickerNav,
  action: ModelPickerNavAction,
): ModelPickerNav {
  switch (action.type) {
    case "setQuery":
      return state.query === action.query
        ? state
        : { ...state, query: action.query };
    case "enterProvider":
      // Opening a provider drops any active search so its own models show.
      return {
        query: "",
        view: { level: "models", providerId: action.providerId },
      };
    case "back":
      // Only level 2 has somewhere to go back to; level 1 is a no-op.
      return state.view.level === "models"
        ? { query: "", view: { level: "providers" } }
        : state;
  }
}
