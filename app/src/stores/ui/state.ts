import type { StateCreator } from "zustand";
import type { DialogActions, DialogFields } from "./dialogs-slice.ts";
import type { LayoutActions, LayoutFields } from "./layout-slice.ts";
import type { NavActions, NavFields } from "./nav-state.ts";
import type { PanelActions, PanelFields } from "./panel-slice.ts";
import type { SessionActions, SessionFields } from "./session-slice.ts";
import type { ToastActions, ToastFields } from "./toast-slice.ts";

export type UIState = NavFields &
  NavActions &
  PanelFields &
  PanelActions &
  ToastFields &
  ToastActions &
  DialogFields &
  DialogActions &
  SessionFields &
  SessionActions &
  LayoutFields &
  LayoutActions & {
    reset: () => void;
  };

export type UISliceCreator<T> = StateCreator<
  UIState,
  [["zustand/persist", unknown]],
  [],
  T
>;
