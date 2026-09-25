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
  /**
   * Whether "Your teams", the rail's one LABELLED band, is folded away.
   *
   * Persisted, because a rail that forgets it was folded on every reload is
   * worse than one that never folded, and per-MACHINE rather than per-account,
   * like every other layout pref here. The rows that LEAD the rail (the
   * Assistant, AI Models, Integrations) wear no band and fold nothing: there is
   * no heading to fold them under.
   */
  teamsSectionCollapsed: boolean;
}

export interface LayoutActions {
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setChatWide: (wide: boolean) => void;
  toggleChatWide: () => void;
  toggleTeamsSectionCollapsed: () => void;
}

export const layoutInitialState = {
  sidebarCollapsed: false,
  chatWide: false,
  teamsSectionCollapsed: false,
} satisfies LayoutFields;

export const createLayoutActions: UISliceCreator<LayoutActions> = (set) => ({
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  toggleSidebarCollapsed: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setChatWide: (chatWide) => set({ chatWide }),
  toggleChatWide: () => set((s) => ({ chatWide: !s.chatWide })),
  toggleTeamsSectionCollapsed: () =>
    set((s) => ({ teamsSectionCollapsed: !s.teamsSectionCollapsed })),
});
