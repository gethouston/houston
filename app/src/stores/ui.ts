import type { PortableUploadPreviewResponse } from "@houston-ai/engine-client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setPanelOwner } from "../components/shell/detail-panel-owners.ts";
import type { SettingsSectionId } from "../lib/settings-sections";
import { TEAM_VIEW_ID, type TeamSectionId } from "../lib/teams-model.ts";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "error" | "success" | "info";
  action?: { label: string; onClick: () => void };
  /** How many identical firings this toast represents (coalesced repeats). */
  count?: number;
}

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
  /**
   * Which Settings section is open (`null` = the Settings index). The single
   * source of truth, not a one-shot pin: `SettingsView` renders from it and
   * writes it on drill-in/back, and every surface that navigates INTO Settings
   * goes through {@link UIState.openSettings}, which sets the section and the
   * view together. That is what makes "open Settings" deterministic — clicking
   * Settings in the sidebar while a section is open lands on the index instead
   * of doing nothing.
   */
  settingsSection: SettingsSectionId | null;
  /**
   * The open team view (`viewMode === TEAM_VIEW_ID`): which team and which of
   * its sections (mission-control / routines / files / settings). Set together
   * through {@link UIState.openTeamView} so the view is always coherent.
   */
  activeTeamId: string | null;
  teamSection: TeamSectionId | null;
  /**
   * Agent pre-filter for the team Mission Control dropdown (set by clicking an
   * agent row in the sidebar; `null` = all of the team's agents).
   */
  teamAgentFilter: string | null;
  activityPanelId: string | null;
  activityPanelForceOpen: boolean;
  claudeAvailable: boolean | null;
  /** Provider ID that needs re-auth (e.g. "anthropic", "openai"), or null if OK */
  authRequired: string | null;
  toasts: ToastItem[];
  createAgentDialogOpen: boolean;
  /** "Your agent is still being created" write-blocked notice (HOU-693). */
  agentWarmingNoticeOpen: boolean;
  /** Callback registered by whichever mission board is on the glass (the
   *  global one or a team's) to open its new-mission flow. */
  onStartMission: (() => void) | null;
  /**
   * Whether the ONE shell-level detail panel is open (the shell renders it
   * full-height beside `<main>`). DERIVED from `missionPanelOwners` — never
   * set directly.
   */
  missionPanelOpen: boolean;
  /**
   * Ids of the surfaces currently claiming the shell detail panel. Several
   * surfaces render the panel (the mission boards, the Routines chat, the
   * Archived lists, the skill / integration setup chats) and all of them stay
   * MOUNTED while hidden, so a single last-writer-wins boolean strands the
   * panel open as an empty card: the screen that leaves keeps its `true` on the
   * flag while it stops portaling anything into it (PRODUCT-1229). Each
   * surface claims and releases its OWN id via `useShellDetailPanel`, so
   * releasing can never clobber the surface the user just navigated to.
   */
  missionPanelOwners: string[];
  /** Whether the mobile (<768px) sidebar drawer is open. Session-only, never
   *  persisted: a drawer restored open after a reload is a trap on a phone. */
  mobileSidebarOpen: boolean;
  /**
   * One-shot nav target for a routine chat with no board card (session-
   * finished notification click, #401): the OWNING agent plus the activity id
   * to open in that team's Routines section. The owner travels with it because
   * that section is cross-agent: without it the surface would have to guess
   * whose chat the id belongs to, and guess wrong the moment two agents are in
   * view. The section mounts the owner's chat host, which resolves the id to a
   * routine or a draft and clears the request.
   */
  pendingRoutineChat: { agentId: string; activityId: string } | null;
  /**
   * One-shot nav target for a skill-setup chat with no board card (session-
   * finished notification click, HOU-791): the activity id to open in the
   * Skills section. The surface consumes it (resolves which skill or draft it
   * belongs to, opens the chat, clears it) the moment it sees a match.
   */
  pendingSkillChatActivityId: string | null;
  /** Agent id whose custom-integration setup chat (Integrations page) is
   *  open, or null. The draft itself is derived from that agent's activities;
   *  the page has no per-chat route, so an explicit flag marks the open one. */
  integrationSetupChatAgentId: string | null;
  /** Whether the global command palette (⌘K) is open. */
  paletteOpen: boolean;
  /** Whether the keyboard shortcut cheatsheet (?) is open. */
  cheatsheetOpen: boolean;
  /** Arrow-key kanban navigator registered by whichever board is on
   *  screen (the global Mission Control or a team's). Moves the
   *  keyboard highlight; does NOT open the chat panel. */
  onBoardNavigate: ((dir: "up" | "down" | "left" | "right") => void) | null;
  /** Open the currently-highlighted card's chat panel. Registered by
   *  the same board owner as `onBoardNavigate`. Fired by Enter. */
  onBoardOpen: (() => void) | null;
  /** Close the chat detail panel. Registered by the board owner while
   *  a card is selected; fired by Escape when the composer is not
   *  focused (the first Escape blurs the composer, the second closes). */
  onPanelClose: (() => void) | null;
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
  /** A one-shot flag that opens the Agent Store view on its "my agents" tab —
   * set by "Manage all my agents" affordances before `setViewMode(STORE_VIEW_ID)`,
   * cleared by the view once consumed. Ephemeral, never persisted. */
  storeOwnerTab: "my" | null;
  /** A one-shot slug queued by an `houston://store/install` deep link (desktop)
   * or a `?install=<slug>` web param: the always-on deep-link hook seeds the
   * import wizard with the store listing, then clears it. Ephemeral, never
   * persisted (a reload must not re-trigger the install). */
  pendingStoreInstallSlug: string | null;
  /** A one-shot creator @handle the Agent Store view opens the creator pane on
   * (mirrors `storeFocusSlug`): set by "View profile" affordances and by an
   * `houston://store/creator?handle=…` deep link / `?creator=<handle>` web param
   * before `setViewMode(STORE_VIEW_ID)`, cleared by the view once consumed.
   * Ephemeral, never persisted. */
  storeCreatorHandle: string | null;
  /** Whether the creator-profile editor dialog is open. Ephemeral, never
   * persisted (a dialog flag like `createAgentDialogOpen`). */
  creatorEditorOpen: boolean;
  /** Whether the left rail is collapsed to an icon-only strip. Persisted. */
  sidebarCollapsed: boolean;
  /** Files section layout: Drive-style card grid or Finder-style list. Persisted. */
  filesViewMode: "grid" | "list";
  /** File shown by the global preview dialog, or null when closed. */
  filePreview: FilePreviewTarget | null;
  setViewMode: (mode: string) => void;
  openTeamView: (
    teamId: string,
    section: TeamSectionId,
    opts?: { agentFilter?: string | null },
  ) => void;
  setTeamAgentFilter: (agentId: string | null) => void;
  setSettingsSection: (section: SettingsSectionId | null) => void;
  /**
   * Navigate to Settings, on `section` (or its index when `null`). ONE call so a
   * caller can never set the view and forget the section: a plain "open
   * Settings" always lands on the index, and a deep link always lands on its
   * section, whether or not Settings was already open.
   */
  openSettings: (section: SettingsSectionId | null) => void;
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
  /** Claim (`open`) or release the shell detail panel for one surface. */
  setMissionPanelOwner: (ownerId: string, open: boolean) => void;
  /** Release every claim — the "get me out of this panel" escape hatch. */
  closeMissionPanel: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setPendingRoutineChat: (
    target: { agentId: string; activityId: string } | null,
  ) => void;
  setPendingSkillChatActivityId: (activityId: string | null) => void;
  setIntegrationSetupChatAgentId: (agentId: string | null) => void;
  setPaletteOpen: (open: boolean) => void;
  setCheatsheetOpen: (open: boolean) => void;
  setOnBoardNavigate: (
    cb: ((dir: "up" | "down" | "left" | "right") => void) | null,
  ) => void;
  setOnBoardOpen: (cb: (() => void) | null) => void;
  setOnPanelClose: (cb: (() => void) | null) => void;
  setTutorialActive: (active: boolean) => void;
  setUiTourActive: (active: boolean) => void;
  setShareAgentId: (agentId: string | null) => void;
  setImportFromFriendOpen: (open: boolean) => void;
  setImportSeedPreview: (preview: PortableUploadPreviewResponse | null) => void;
  setStoreFocusSlug: (slug: string | null) => void;
  setStoreOwnerTab: (v: "my" | null) => void;
  setPendingStoreInstallSlug: (slug: string | null) => void;
  setStoreCreatorHandle: (handle: string | null) => void;
  setCreatorEditorOpen: (open: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setFilesViewMode: (mode: "grid" | "list") => void;
  setFilePreview: (preview: FilePreviewTarget | null) => void;
  /**
   * Reset the ephemeral, identity-scoped view state to its initial values on an
   * identity change (HOU-903) — the outgoing account's open view, panels,
   * dialogs, and searches must not greet the next account. The two persisted
   * device layout prefs (`sidebarCollapsed`, `filesViewMode`) are kept: they are
   * per-machine, not per-account.
   */
  reset: () => void;
}

/** The initial data state, shared by the store's creator and `reset()` so the
 *  two can never drift. Excludes the action functions. */
const initialUIState = {
  viewMode: "dashboard",
  settingsSection: null,
  activityPanelId: null,
  activityPanelForceOpen: false,
  claudeAvailable: null,
  authRequired: null,
  toasts: [],
  createAgentDialogOpen: false,
  agentWarmingNoticeOpen: false,
  onStartMission: null,
  missionPanelOpen: false,
  missionPanelOwners: [],
  mobileSidebarOpen: false,
  pendingRoutineChat: null,
  pendingSkillChatActivityId: null,
  integrationSetupChatAgentId: null,
  paletteOpen: false,
  cheatsheetOpen: false,
  onBoardNavigate: null,
  onBoardOpen: null,
  onPanelClose: null,
  tutorialActive: false,
  uiTourActive: false,
  shareAgentId: null,
  importFromFriendOpen: false,
  importSeedPreview: null,
  storeFocusSlug: null,
  storeOwnerTab: null,
  pendingStoreInstallSlug: null,
  storeCreatorHandle: null,
  creatorEditorOpen: false,
  sidebarCollapsed: false,
  filesViewMode: "grid",
  filePreview: null,
  activeTeamId: null,
  teamSection: null,
  teamAgentFilter: null,
} satisfies Partial<UIState>;

let toastCounter = 0;
// Live dismiss timers by toast id, so a coalesced repeat can RESTART its
// toast's countdown (see addToast) and a manual dismiss cancels it.
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      ...initialUIState,

      setViewMode: (viewMode) => set({ viewMode }),
      openTeamView: (activeTeamId, teamSection, opts) =>
        set({
          viewMode: TEAM_VIEW_ID,
          activeTeamId,
          teamSection,
          teamAgentFilter: opts?.agentFilter ?? null,
        }),
      setTeamAgentFilter: (teamAgentFilter) => set({ teamAgentFilter }),
      setSettingsSection: (settingsSection) => set({ settingsSection }),
      openSettings: (settingsSection) =>
        set({ viewMode: "settings", settingsSection }),
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
      setMissionPanelOwner: (ownerId, open) =>
        set((s) => {
          const missionPanelOwners = setPanelOwner(
            s.missionPanelOwners,
            ownerId,
            open,
          );
          if (missionPanelOwners === s.missionPanelOwners) return s;
          return {
            missionPanelOwners,
            missionPanelOpen: missionPanelOwners.length > 0,
          };
        }),
      closeMissionPanel: () =>
        set({ missionPanelOwners: [], missionPanelOpen: false }),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
      setPendingRoutineChat: (pendingRoutineChat) =>
        set({ pendingRoutineChat }),
      setPendingSkillChatActivityId: (pendingSkillChatActivityId) =>
        set({ pendingSkillChatActivityId }),
      setIntegrationSetupChatAgentId: (integrationSetupChatAgentId) =>
        set({ integrationSetupChatAgentId }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setCheatsheetOpen: (cheatsheetOpen) => set({ cheatsheetOpen }),
      setOnBoardNavigate: (onBoardNavigate) => set({ onBoardNavigate }),
      setOnBoardOpen: (onBoardOpen) => set({ onBoardOpen }),
      setOnPanelClose: (onPanelClose) => set({ onPanelClose }),
      setTutorialActive: (tutorialActive) => set({ tutorialActive }),
      setUiTourActive: (uiTourActive) => set({ uiTourActive }),
      setShareAgentId: (shareAgentId) => set({ shareAgentId }),
      setImportFromFriendOpen: (importFromFriendOpen) =>
        set({ importFromFriendOpen }),
      setImportSeedPreview: (importSeedPreview) => set({ importSeedPreview }),
      setStoreFocusSlug: (storeFocusSlug) => set({ storeFocusSlug }),
      setStoreOwnerTab: (storeOwnerTab) => set({ storeOwnerTab }),
      setPendingStoreInstallSlug: (pendingStoreInstallSlug) =>
        set({ pendingStoreInstallSlug }),
      setStoreCreatorHandle: (storeCreatorHandle) =>
        set({ storeCreatorHandle }),
      setCreatorEditorOpen: (creatorEditorOpen) => set({ creatorEditorOpen }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebarCollapsed: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setFilesViewMode: (filesViewMode) => set({ filesViewMode }),
      setFilePreview: (filePreview) => set({ filePreview }),

      reset: () => {
        // Cancel any live dismiss timers before dropping their toasts, so a
        // pending timeout can't fire against the next account's store.
        for (const timer of toastTimers.values()) clearTimeout(timer);
        toastTimers.clear();
        set((s) => ({
          ...initialUIState,
          // Keep the per-machine layout prefs (not identity-scoped).
          sidebarCollapsed: s.sidebarCollapsed,
          filesViewMode: s.filesViewMode,
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
        filesViewMode: state.filesViewMode,
      }),
    },
  ),
);
