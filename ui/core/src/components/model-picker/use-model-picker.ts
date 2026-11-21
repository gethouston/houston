import type * as React from "react";
import { useCallback, useReducer } from "react";
import { initialNav, type ModelPickerNav, navReducer } from "./nav";

export interface ModelPickerController {
  nav: ModelPickerNav;
  setQuery: (query: string) => void;
  enterProvider: (providerId: string) => void;
  back: () => void;
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
