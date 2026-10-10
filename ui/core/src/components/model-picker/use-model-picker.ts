import type * as React from "react";
import { useCallback, useReducer } from "react";
import { initialNav, type ModelPickerNav, navReducer } from "./nav";

/** Local nav state for the picker: which level, and the current search query. */
export interface ModelPickerController {
  nav: ModelPickerNav;
  setQuery: (query: string) => void;
  enterProvider: (providerId: string) => void;
  back: () => void;
  /** The Command root's key handler (Escape/Backspace navigation). */
  handleKeyDown: (e: React.KeyboardEvent) => void;
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

  // Escape/Backspace back out of level 2 before Radix closes the popover. An
  // active query is peeled off first (Escape clears the search), then a second
  // Escape (or Backspace on an empty query) steps back to the provider list.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      if (nav.query !== "") {
        e.preventDefault();
        e.stopPropagation();
        setQuery("");
      } else if (nav.view.level === "models") {
        e.preventDefault();
        e.stopPropagation();
        back();
      }
      return;
    }
    if (
      e.key === "Backspace" &&
      nav.query === "" &&
      nav.view.level === "models"
    ) {
      e.preventDefault();
      e.stopPropagation();
      back();
    }
  };

  return { nav, setQuery, enterProvider, back, handleKeyDown };
}
