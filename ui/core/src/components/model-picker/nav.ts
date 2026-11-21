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
      return {
        query: "",
        view: { level: "models", providerId: action.providerId },
      };
    case "back":
      return state.view.level === "models"
        ? { query: "", view: { level: "providers" } }
        : state;
  }
}
