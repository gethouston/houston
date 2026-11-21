import type { UISliceCreator } from "./state.ts";

export interface LayoutFields {
  sidebarCollapsed: boolean;
  chatWide: boolean;
  previewWidth: number;
  previewRail: boolean;
  previewExpanded: boolean;
  previewHintSeen: boolean;
}

export interface LayoutActions {
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setChatWide: (wide: boolean) => void;
  toggleChatWide: () => void;
  setPreviewWidth: (share: number) => void;
  togglePreviewRail: () => void;
  togglePreviewExpanded: () => void;
  markPreviewHintSeen: () => void;
}

export const layoutInitialState = {
  sidebarCollapsed: false,
  chatWide: false,
  previewWidth: 0.5,
  previewRail: true,
  previewExpanded: false,
  previewHintSeen: false,
} satisfies LayoutFields;

export const createLayoutActions: UISliceCreator<LayoutActions> = (set) => ({
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebarCollapsed: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setChatWide: (chatWide) => set({ chatWide }),
  toggleChatWide: () => set((s) => ({ chatWide: !s.chatWide })),
  setPreviewWidth: (previewWidth) => set({ previewWidth }),
  togglePreviewRail: () => set((s) => ({ previewRail: !s.previewRail })),
  togglePreviewExpanded: () =>
    set((s) => ({ previewExpanded: !s.previewExpanded })),
  markPreviewHintSeen: () => set({ previewHintSeen: true }),
});
