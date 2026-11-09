import type { UISliceCreator } from "./state.ts";

/** Per-machine layout preferences: the only persisted fields, and the ones
 *  `reset` keeps across identity changes. */
export interface LayoutFields {
  /** Whether the left rail is collapsed to an icon-only strip. Persisted. */
  sidebarCollapsed: boolean;
  /**
   * Whether the detail panel's chat fills the whole content row instead of
   * sitting beside the board (the assistant's own full-width presentation).
   * A per-machine layout preference like `sidebarCollapsed`: persisted, kept
   * across identity resets. It only takes effect while a surface that opted
   * in holds the panel (`detail-panel-owners.ts`), and never below md, where
   * the panel already covers the screen.
   */
  chatWide: boolean;
  /** The file preview panel's share of the content row, 0..1, as its grip
   *  last left it. Persisted like `chatWide`. */
  previewWidth: number;
  /** Whether the preview's page thumbnails are shown (where there is room). */
  previewRail: boolean;
  /** The preview takes the whole row, the chat stepping out. Not persisted:
   *  each opening starts beside the chat. */
  previewExpanded: boolean;
  /** The one-time "select text or drag an area" hint was dismissed. */
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
