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
        clearToastTimers();
        set((s) => ({
          ...initialUIState,
          ...initialNavState(),
          sidebarCollapsed: s.sidebarCollapsed,
          chatWide: s.chatWide,
          previewWidth: s.previewWidth,
          previewRail: s.previewRail,
          previewHintSeen: s.previewHintSeen,
        }));
      },
    }),
    {
      name: "houston-ui",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        chatWide: state.chatWide,
        previewWidth: state.previewWidth,
        previewRail: state.previewRail,
        previewHintSeen: state.previewHintSeen,
      }),
    },
  ),
);
