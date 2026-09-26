import { create } from "zustand";
import { persist } from "zustand/middleware";
import { initialNavState } from "../lib/nav-stack.ts";
import { createDialogActions, dialogInitialState } from "./ui/dialogs-slice.ts";
import { createLayoutActions, layoutInitialState } from "./ui/layout-slice.ts";
import { createNavActions } from "./ui/nav-slice.ts";
import { navInitialState } from "./ui/nav-state.ts";
import { createPanelActions, panelInitialState } from "./ui/panel-slice.ts";
import {
  createSessionActions,
  sessionInitialState,
} from "./ui/session-slice.ts";
import type { UIState } from "./ui/state.ts";
import {
  clearToastTimers,
  createToastActions,
  toastInitialState,
} from "./ui/toast-slice.ts";

export type {
  CreateFlowRequest,
  FilePreviewTarget,
  ToastItem,
} from "./ui/types.ts";

/** The initial data state, shared by the store's creator and `reset()` so the
 *  two can never drift. Excludes the action functions. */
const initialUIState = {
  ...navInitialState,
  ...panelInitialState,
  ...toastInitialState,
  ...dialogInitialState,
  ...sessionInitialState,
  ...layoutInitialState,
} satisfies Partial<UIState>;

export const useUIStore = create<UIState>()(
  persist(
    (set, get, api) => ({
      ...initialUIState,
      ...createNavActions(set, get, api),
      ...createPanelActions(set, get, api),
      ...createToastActions(set, get, api),
      ...createDialogActions(set, get, api),
      ...createSessionActions(set, get, api),
      ...createLayoutActions(set, get, api),

      reset: () => {
        // Cancel any live dismiss timers before dropping their toasts, so a
        // pending timeout can't fire against the next account's store.
        clearToastTimers();
        set((s) => ({
          ...initialUIState,
          // A fresh stack, not the shared initial array: a waiting nav watches
          // the stack's identity to learn that the user moved (open-agent.ts).
          ...initialNavState(),
          // Keep the per-machine layout prefs (not identity-scoped).
          sidebarCollapsed: s.sidebarCollapsed,
          chatWide: s.chatWide,
          teamsSectionCollapsed: s.teamsSectionCollapsed,
        }));
      },
    }),
    {
      name: "houston-ui",
      // Only durable layout preferences are persisted. Everything else in this
      // store is ephemeral (toasts, registered callbacks, dialog flags) and
      // must NOT survive a reload.
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        chatWide: state.chatWide,
        teamsSectionCollapsed: state.teamsSectionCollapsed,
      }),
    },
  ),
);
