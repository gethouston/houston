import type { PortableUploadPreviewResponse } from "@houston-ai/engine-client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SettingsSectionId } from "../lib/settings-sections";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "error" | "success" | "info";
  action?: { label: string; onClick: () => void };
  /** How many identical firings this toast represents (coalesced repeats). */
  count?: number;
}

export type JobDescriptionTarget = "instructions" | "skills" | "learnings";

/** A workspace file queued for the global in-app preview dialog (chat file
 * cards, turn summaries, prose file pills — HOU: preview files from chat). */
export interface FilePreviewTarget {
  /** The agent's `folderPath` (route key / directory, per engine). */
  agentPath: string;
  /** Workspace-relative path of the file. */
  filePath: string;
  fileName: string;
}

interface UIState {
  viewMode: string;
  /** A one-shot deep-link consumed by SettingsView on mount: other surfaces set
   * it right before `setViewMode("settings")` to open a specific section, and
   * SettingsView clears it once read so a later plain Settings open lands home. */
  settingsSection: SettingsSectionId | null;
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
  /**
   * One-shot nav target for a routine chat with no board card (session-
   * finished notification click, #401): the activity id to open in the
   * Routines tab. The tab consumes it (resolves which routine it belongs to,
   * navigates, clears it) the moment it sees a match.
   */
  pendingRoutineActivityId: string | null;
  /** Agent id whose custom-integration setup chat (Integrations page) is
   *  open, or null. The draft itself is derived from that agent's activities;
   *  the page has no per-chat route, so an explicit flag marks the open one. */
  integrationSetupChatAgentId: string | null;
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
  /** Agent id queued for the "Export a copy" wizard, or null. */
  shareAgentId: string | null;
  /** Whether the "From a friend" import wizard is open. */
  importFromFriendOpen: boolean;
  /** A one-shot preview the import wizard adopts on open — set by the Agent
   * Store's one-click install right before opening the wizard, cleared by the
   * wizard once applied. Ephemeral, never persisted. */
  importSeedPreview: PortableUploadPreviewResponse | null;
  /** A one-shot slug the Agent Store view opens the detail dialog on — set by
   * "See it in the store" affordances before `setViewMode(STORE_VIEW_ID)`,
   * cleared by the view once consumed. */
  storeFocusSlug: string | null;
  /** Whether the left rail is collapsed to an icon-only strip. Persisted. */
  sidebarCollapsed: boolean;
  /** File shown by the global preview dialog, or null when closed. */
  filePreview: FilePreviewTarget | null;
  setViewMode: (mode: string) => void;
  setSettingsSection: (section: SettingsSectionId | null) => void;
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
  setPendingRoutineActivityId: (activityId: string | null) => void;
  setIntegrationSetupChatAgentId: (agentId: string | null) => void;
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
  setImportSeedPreview: (preview: PortableUploadPreviewResponse | null) => void;
  setStoreFocusSlug: (slug: string | null) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setFilePreview: (preview: FilePreviewTarget | null) => void;
}

let toastCounter = 0;
// Live dismiss timers by toast id, so a coalesced repeat can RESTART its
// toast's countdown (see addToast) and a manual dismiss cancels it.
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      viewMode: "chat",
      settingsSection: null,
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
      pendingRoutineActivityId: null,
      integrationSetupChatAgentId: null,
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
      importSeedPreview: null,
      storeFocusSlug: null,
      sidebarCollapsed: false,
      filePreview: null,

      setViewMode: (viewMode) => set({ viewMode }),
      setSettingsSection: (settingsSection) => set({ settingsSection }),
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
          const timeout = toast.action ? 10000 : 5000;
          const expireAfter = (id: string) => {
            const prevTimer = toastTimers.get(id);
            if (prevTimer) clearTimeout(prevTimer);
            toastTimers.set(
              id,
              setTimeout(() => {
                toastTimers.delete(id);
                set((prev) => ({
                  toasts: prev.toasts.filter((t) => t.id !== id),
                }));
              }, timeout),
            );
          };

          // Repeats COALESCE instead of stacking (a repeatedly failing
          // connect used to wall the screen with identical error boxes): the
          // existing toast's counter bumps and its dismiss countdown restarts,
          // so every firing still gives visible feedback AND the toast's
          // action ("Report bug") stays alive — the two failure modes the old
          // "never dedupe errors" rule protected against.
          const existing = s.toasts.find(
            (t) =>
              t.title === toast.title &&
              t.description === toast.description &&
              (t.variant ?? "info") === (toast.variant ?? "info"),
          );
          if (existing) {
            expireAfter(existing.id);
            return {
              toasts: s.toasts.map((t) =>
                t.id === existing.id ? { ...t, count: (t.count ?? 1) + 1 } : t,
              ),
            };
          }

          const id = `toast-${++toastCounter}`;
          expireAfter(id);
          return { toasts: [...s.toasts, { ...toast, id }] };
        }),

      dismissToast: (id) =>
        set((s) => {
          const timer = toastTimers.get(id);
          if (timer) clearTimeout(timer);
          toastTimers.delete(id);
          return { toasts: s.toasts.filter((t) => t.id !== id) };
        }),

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
      setPendingRoutineActivityId: (pendingRoutineActivityId) =>
        set({ pendingRoutineActivityId }),
      setIntegrationSetupChatAgentId: (integrationSetupChatAgentId) =>
        set({ integrationSetupChatAgentId }),
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
      setImportSeedPreview: (importSeedPreview) => set({ importSeedPreview }),
      setStoreFocusSlug: (storeFocusSlug) => set({ storeFocusSlug }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebarCollapsed: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setFilePreview: (filePreview) => set({ filePreview }),
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
