import { useCallback, useReducer } from "react";
import { initialNav, type ModelPickerNav, navReducer } from "./nav";

/** Local nav state for the picker: which level, and the current search query. */
export interface ModelPickerController {
  nav: ModelPickerNav;
  setQuery: (query: string) => void;
  enterProvider: (providerId: string) => void;
  back: () => void;
}

export function useModelPicker(): ModelPickerController {
  const [nav, dispatch] = useReducer(navReducer, undefined, initialNav);
  const setQuery = useCallback(
    (query: string) => dispatch({ type: "setQuery", query }),
    [],
  );
  const enterProvider = useCallback(
    (providerId: string) => dispatch({ type: "enterProvider", providerId }),
    [],
  );
  const back = useCallback(() => dispatch({ type: "back" }), []);
  return { nav, setQuery, enterProvider, back };
}
