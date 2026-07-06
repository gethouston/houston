import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "error" | "success" | "info";
  action?: { label: string; onClick: () => void };
}

export type JobDescriptionTarget = "instructions" | "skills" | "learnings";

interface UIState {
  viewMode: string;
  assistantPanelOpen: boolean;
  activityPanelId: string | null;
  activityPanelForceOpen: boolean;
  claudeAvailable: boolean | null;
  /** Provider ID that needs re-auth (e.g. "anthropic", "openai"), or null if OK */
  authRequired: string | null;
  toasts: ToastItem[];
  createAgentDialogOpen: boolean;
  /** "Your agent is still being created" write-blocked notice (HOU-693). */
  agentWarmingNoticeOpen: boolean;
  /** Callback registered by the board tab to open the new-mission panel */
  onStartMission: (() => void) | null;
  /** Extra create actions registered by the board tab (e.g. "New Planning Session"). */
  boardActions: Array<{ id: string; label: string; onClick: () => void }>;
  /** Per-agent mission search query shown in the agent header. */
  agentMissionSearchQueries: Record<string, string>;
  /** Whether a per-agent mission search is loading conversation text. */
  agentMissionSearchLoading: Record<string, boolean>;
  /** Per-agent archived-tab search query (separate from the active board search). */
  agentArchivedSearchQueries: Record<string, string>;
  /** Whether the per-agent archived-tab search is loading conversation text. */
  agentArchivedSearchLoading: Record<string, boolean>;
  /** Whether the mission chat panel is open (hides tab bar for full-height panel) */
  missionPanelOpen: boolean;
  /** Whether the global command palette (⌘K) is open. */
  paletteOpen: boolean;
  /** Whether the keyboard shortcut cheatsheet (?) is open. */
  cheatsheetOpen: boolean;
  /** Arrow-key kanban navigator registered by whichever board is on
   *  screen (Mission Control or an agent's Activity tab). Moves the
   *  keyboard highlight; does NOT open the chat panel. */
  onBoardNavigate: ((dir: "up" | "down" | "left" | "right") => void) | null;
  /** Open the currently-highlighted card's chat panel. Registered by
   *  the same board owner as `onBoardNavigate`. Fired by Enter. */
  onBoardOpen: (() => void) | null;
  /** Close the chat detail panel. Registered by the board owner while
   *  a card is selected; fired by Escape when the composer is not
   *  focused (the first Escape blurs the composer, the second closes). */
  onPanelClose: (() => void) | null;
  jobDescriptionTarget: JobDescriptionTarget | null;
  /** Pin the first-run tutorial UI in front of the workspace shell. Set true
   * while the orchestrator is mid-flight, cleared on graduation or skip. */
  tutorialActive: boolean;
  /** Render the post-tutorial UI tour overlay over the workspace shell.
   * Set when the user completes M3 Try and clicks "Tutorial complete";
   * cleared when the user dismisses the final tour step. */
  uiTourActive: boolean;
  /** Agent id queued for the "Share with a friend" wizard, or null. */
  shareAgentId: string | null;
  /** Whether the "From a friend" import wizard is open. */
  importFromFriendOpen: boolean;
  /** Whether the left rail is collapsed to an icon-only strip. Persisted. */
  sidebarCollapsed: boolean;
  setViewMode: (mode: string) => void;
  setAssistantPanelOpen: (open: boolean) => void;
  setActivityPanelId: (
    id: string | null,
    options?: { forceOpen?: boolean },
  ) => void;
  setClaudeAvailable: (available: boolean | null) => void;
  setAuthRequired: (provider: string | null) => void;
  addToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
  setCreateAgentDialogOpen: (open: boolean) => void;
  setAgentWarmingNoticeOpen: (open: boolean) => void;
  setOnStartMission: (cb: (() => void) | null) => void;
  setBoardActions: (
    actions: Array<{ id: string; label: string; onClick: () => void }>,
  ) => void;
  setAgentMissionSearchQuery: (agentPath: string, query: string) => void;
  setAgentMissionSearchLoading: (agentPath: string, loading: boolean) => void;
  setAgentArchivedSearchQuery: (agentPath: string, query: string) => void;
  setAgentArchivedSearchLoading: (agentPath: string, loading: boolean) => void;
  setMissionPanelOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setCheatsheetOpen: (open: boolean) => void;
  setOnBoardNavigate: (
    cb: ((dir: "up" | "down" | "left" | "right") => void) | null,
  ) => void;
  setOnBoardOpen: (cb: (() => void) | null) => void;
  setOnPanelClose: (cb: (() => void) | null) => void;
  setJobDescriptionTarget: (target: JobDescriptionTarget | null) => void;
  setTutorialActive: (active: boolean) => void;
  setUiTourActive: (active: boolean) => void;
  setShareAgentId: (agentId: string | null) => void;
  setImportFromFriendOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
}

let toastCounter = 0;

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      viewMode: "chat",
      assistantPanelOpen: false,
      activityPanelId: null,
      activityPanelForceOpen: false,
      claudeAvailable: null,
      authRequired: null,
      toasts: [],
      createAgentDialogOpen: false,
      agentWarmingNoticeOpen: false,
      onStartMission: null,
      boardActions: [],
      agentMissionSearchQueries: {},
      agentMissionSearchLoading: {},
      agentArchivedSearchQueries: {},
      agentArchivedSearchLoading: {},
      missionPanelOpen: false,
      paletteOpen: false,
      cheatsheetOpen: false,
      onBoardNavigate: null,
      onBoardOpen: null,
      onPanelClose: null,
      jobDescriptionTarget: null,
      tutorialActive: false,
      uiTourActive: false,
      shareAgentId: null,
      importFromFriendOpen: false,
      sidebarCollapsed: false,

      setViewMode: (viewMode) => set({ viewMode }),
      setAssistantPanelOpen: (assistantPanelOpen) =>
        set({ assistantPanelOpen }),
      setActivityPanelId: (activityPanelId, options) =>
        set({
          activityPanelId,
          activityPanelForceOpen: activityPanelId
            ? (options?.forceOpen ?? false)
            : false,
        }),
      setClaudeAvailable: (claudeAvailable) => set({ claudeAvailable }),
      setAuthRequired: (authRequired) => set({ authRequired }),

      addToast: (toast) =>
        set((s) => {
          // Error toasts must always render. Dedup hid genuine repeated failures:
          // clicking "Report bug" after the first failure would silently no-op
          // because the error toast title+description matched the previous one,
          // making the button feel broken even when it was firing correctly.
          if (toast.variant !== "error") {
            const isDuplicate = s.toasts.some(
              (t) =>
                t.title === toast.title && t.description === toast.description,
            );
            if (isDuplicate) return s;
          }

          const id = `toast-${++toastCounter}`;
          const timeout = toast.action ? 10000 : 5000;
          setTimeout(() => {
            set((prev) => ({ toasts: prev.toasts.filter((t) => t.id !== id) }));
          }, timeout);
          return { toasts: [...s.toasts, { ...toast, id }] };
        }),

      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      setCreateAgentDialogOpen: (createAgentDialogOpen) =>
        set({ createAgentDialogOpen }),

      setAgentWarmingNoticeOpen: (agentWarmingNoticeOpen) =>
        set({ agentWarmingNoticeOpen }),

      setOnStartMission: (onStartMission) => set({ onStartMission }),
      setBoardActions: (boardActions) => set({ boardActions }),
      setAgentMissionSearchQuery: (agentPath, query) =>
        set((s) => {
          const next = { ...s.agentMissionSearchQueries };
          if (query) next[agentPath] = query;
          else delete next[agentPath];
          return { agentMissionSearchQueries: next };
        }),
      setAgentMissionSearchLoading: (agentPath, loading) =>
        set((s) => {
          const next = { ...s.agentMissionSearchLoading };
          if (loading) next[agentPath] = true;
          else delete next[agentPath];
          return { agentMissionSearchLoading: next };
        }),
      setAgentArchivedSearchQuery: (agentPath, query) =>
        set((s) => {
          const next = { ...s.agentArchivedSearchQueries };
          if (query) next[agentPath] = query;
          else delete next[agentPath];
          return { agentArchivedSearchQueries: next };
        }),
      setAgentArchivedSearchLoading: (agentPath, loading) =>
        set((s) => {
          const next = { ...s.agentArchivedSearchLoading };
          if (loading) next[agentPath] = true;
          else delete next[agentPath];
          return { agentArchivedSearchLoading: next };
        }),
      setMissionPanelOpen: (missionPanelOpen) => set({ missionPanelOpen }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setCheatsheetOpen: (cheatsheetOpen) => set({ cheatsheetOpen }),
      setOnBoardNavigate: (onBoardNavigate) => set({ onBoardNavigate }),
      setOnBoardOpen: (onBoardOpen) => set({ onBoardOpen }),
      setOnPanelClose: (onPanelClose) => set({ onPanelClose }),
      setJobDescriptionTarget: (jobDescriptionTarget) =>
        set({ jobDescriptionTarget }),
      setTutorialActive: (tutorialActive) => set({ tutorialActive }),
      setUiTourActive: (uiTourActive) => set({ uiTourActive }),
      setShareAgentId: (shareAgentId) => set({ shareAgentId }),
      setImportFromFriendOpen: (importFromFriendOpen) =>
        set({ importFromFriendOpen }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebarCollapsed: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "houston-ui",
      // Only durable layout preferences are persisted. Everything else in this
      // store is ephemeral (toasts, registered callbacks, dialog flags) and
      // must NOT survive a reload.
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
