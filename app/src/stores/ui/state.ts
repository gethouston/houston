import type { StateCreator } from "zustand";
import type { DialogActions, DialogFields } from "./dialogs-slice.ts";
import type { LayoutActions, LayoutFields } from "./layout-slice.ts";
import type { NavActions, NavFields } from "./nav-state.ts";
import type { PanelActions, PanelFields } from "./panel-slice.ts";
import type { SessionActions, SessionFields } from "./session-slice.ts";
import type { ToastActions, ToastFields } from "./toast-slice.ts";

/** The whole UI store: every slice's fields and actions, plus `reset`. */
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
    /**
     * Reset the ephemeral, identity-scoped view state to its initial values on
     * an identity change (HOU-903) — the outgoing account's open view, panels,
     * dialogs, and searches must not greet the next account. The persisted
     * device layout prefs (`sidebarCollapsed`, the chat width and the teams
     * band's fold) are kept: they are per-machine, not per-account.
     */
    reset: () => void;
  };

/** A slice's action creator: sees (and writes) the whole store, returns `T`. */
export type UISliceCreator<T> = StateCreator<
  UIState,
  [["zustand/persist", unknown]],
  [],
  T
>;
