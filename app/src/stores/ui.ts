import type { PortableUploadPreviewResponse } from "@houston-ai/engine-client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { setPanelOwner } from "../components/shell/detail-panel-owners.ts";
import {
  initialNavState,
  type NavEntry,
  type NavMode,
  navigated,
  viewFieldsOf,
} from "../lib/nav-stack.ts";
import type { SettingsSectionId } from "../lib/settings-sections";
import { TEAM_VIEW_ID, type TeamSectionId } from "../lib/teams-model.ts";
import { AGENTS_HOME_VIEW_ID, INBOX_VIEW_ID } from "../lib/top-level-views.ts";

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
  /**
   * The open top-level screen (`lib/top-level-views.ts`). It starts as the
   * INBOX: there is no global mission board any more, so the app's home is the
   * first team's Mission Control and no team has resolved on the first paint.
   * The Inbox is the one screen that needs none, which makes it the honest
   * landing — and `use-workspace-view-guards.ts`'s boot rule moves the user on
   * to home the moment the first team lands.
   */
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
  /** Whether the kept-alive team screen is presenting one agent's surfaces. */
  teamAgentFocus: boolean;
  /** Whether the team screen is inside the drilled Team Settings level. */
  teamSettingsFocus: boolean;
  /**
   * The agent the mobile Agents home screen is drilled into (`null` = the
   * agent list). Part of every nav entry so the drill-in is a real place the
   * back button pops; set only through {@link UIState.openAgentsHome}.
   */
  agentsHomeAgentId: string | null;
  /**
   * The phone's pushed mission-chat screen (`lib/nav-stack.ts` documents the
   * pair's semantics): the owning agent, and the open mission or `null` for an
   * empty draft chat. Set only through {@link UIState.openMissionChat} /
   * {@link UIState.closeMissionChat}; every OTHER navigation write clears the
   * pair, so navigating under an open chat closes it.
   */
  chatAgentId: string | null;
  chatMissionId: string | null;
  activityPanelId: string | null;
  activityPanelForceOpen: boolean;
  claudeAvailable: boolean | null;
  /** Provider ID that needs re-auth (e.g. "anthropic", "openai"), or null if OK */
  authRequired: string | null;
  toasts: ToastItem[];
  createAgentDialogOpen: boolean;
  createAgentTeamId: string | null;
  /** The team whose "Change icon & name" dialog is open, or null for none. */
  editTeamIdentityId: string | null;
  /** "Your agent is still being created" write-blocked notice (HOU-693). */
  agentWarmingNoticeOpen: boolean;
  /** Whether the phone's compose agent-picker sheet is open (the mobile
   *  new-mission flow: pick an agent, push its empty draft chat). Ephemeral
   *  dialog flag, never persisted. */
  newMissionSheetOpen: boolean;
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
  /** Render the in-app onboarding overlay over the workspace shell. Armed on
   * the first-run "onboarding" route and by "Guide me" in the sidebar footer;
   * cleared when the user finishes (or, for now, continues past) the flow. */
  inAppOnboardingActive: boolean;
  /** The running in-app onboarding was armed by the FIRST-RUN route (vs a
   * "Guide me" replay): first-run-only side effects key on this. */
  inAppOnboardingFirstRun: boolean;
  /** The in-app onboarding PREWROTE the new-task composer draft (the guided
   * email first task): user edits to it are ignored while set. */
  tutorialComposerLock: boolean;
  /** The Academy lesson playing over the workspace shell
   * (`components/academy/lessons`), or null. Armed by the Academy path, cleared
   * by finishing or exiting the lesson, and by the guided setup arming (it owns
   * the screen alone). Ephemeral, never persisted: a lesson is a live run over
   * the app, and a reload must land the user back in the app rather than into a
   * beat whose world is long gone. */
  activeLessonId: string | null;
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
  /**
   * Whether each of the rail's three LABELLED bands is folded away.
   *
   * All three fold the same way and persist the same way, because they ARE the
   * same band: a rail whose "My accounts" folded and whose "Your teams" did not
   * would be teaching two rules for one row shape. Persisted, because a rail
   * that forgets it was folded on every reload is worse than one that never
   * folded, and per-MACHINE rather than per-account, like every other layout
   * pref here. The two rows that LEAD the rail (Inbox, Agent Store) wear no
   * band and fold nothing: there is no heading to fold them under.
   */
  teamsSectionCollapsed: boolean;
  myAccountsSectionCollapsed: boolean;
  workspaceSectionCollapsed: boolean;
  /** File shown by the global preview dialog, or null when closed. */
  filePreview: FilePreviewTarget | null;
  /**
   * The navigation stack (`lib/nav-stack.ts`): every screen-level location the
   * user has visited, with `navIndex` as the cursor. The nav-aware actions
   * below fold their writes in (`navigated`), and `lib/nav-history.ts` mirrors
   * the pair into browser history — the ONLY code that touches `history` — so
   * back/forward walk the app. Not persisted: a refresh re-boots to one entry.
   */
  navStack: NavEntry[];
  navIndex: number;
  /** Pop one level — the programmatic equivalent of the browser back button. */
  navBack: () => void;
  /**
   * Jump the stack to `index` (clamped) and apply that entry, closing the
   * detail panel through its owner when the entry has none. For the history
   * sync layer's popstate handler and {@link UIState.navBack} only.
   */
  navApplyHistory: (index: number) => void;
  setViewMode: (mode: string, opts?: { nav?: NavMode }) => void;
  /**
   * Open a team view: the ONE writer of `viewMode` + `activeTeamId` +
   * `teamSection` (+ `teamAgentFilter`), so the view is never half-set. It is
   * also what "go home" means — `lib/home-nav.ts` calls it with the first
   * team and `mission-control`.
   */
  openTeamView: (
    teamId: string,
    section: TeamSectionId,
    opts?: {
      agentFilter?: string | null;
      agentFocus?: boolean;
      teamSettingsFocus?: boolean;
      /** `replace` for redirects (boot, dead-view guard); default `push`. */
      nav?: NavMode;
    },
  ) => void;
  setTeamAgentFilter: (agentId: string | null) => void;
  setSettingsSection: (section: SettingsSectionId | null) => void;
  /**
   * Navigate to Settings, on `section` (or its index when `null`). ONE call so a
   * caller can never set the view and forget the section: a plain "open
   * Settings" always lands on the index, and a deep link always lands on its
   * section, whether or not Settings was already open.
   */
  openSettings: (
    section: SettingsSectionId | null,
    opts?: {
      /** `reset` for the mobile tab bar; default `push`. */ nav?: NavMode;
    },
  ) => void;
  /**
   * Navigate to the mobile Agents home: the agent list (`null`) or one agent's
   * missions screen. ONE call sets the view and the drill level together, so a
   * caller can never land on the screen with a stale drill: the tab bar resets
   * to the list, tapping an agent pushes its missions, its back bar retreats.
   */
  openAgentsHome: (
    agentId: string | null,
    opts?: {
      /** `reset` for the mobile tab bar, `retreat` for the back bar; default
       *  `push`. */
      nav?: NavMode;
    },
  ) => void;
  /**
   * Push the phone's mission-chat screen for `agentId`, on `missionId`'s chat
   * (`null` = an empty draft chat, the compose flow). ONE call sets both ids
   * so the screen can never open half-addressed. `replace` is for the draft
   * chat adopting its just-created mission's id: same screen, now named, and
   * back must not revisit the blank draft.
   */
  openMissionChat: (
    agentId: string,
    missionId: string | null,
    opts?: { nav?: NavMode },
  ) => void;
  /** Pop the pushed mission-chat screen (its back affordance). */
  closeMissionChat: () => void;
  setActivityPanelId: (
    id: string | null,
    options?: { forceOpen?: boolean },
  ) => void;
  setClaudeAvailable: (available: boolean | null) => void;
  setAuthRequired: (provider: string | null) => void;
  addToast: (toast: Omit<ToastItem, "id">) => void;
  dismissToast: (id: string) => void;
  setCreateAgentDialogOpen: (open: boolean, teamId?: string | null) => void;
  setEditTeamIdentityId: (teamId: string | null) => void;
  setAgentWarmingNoticeOpen: (open: boolean) => void;
  setNewMissionSheetOpen: (open: boolean) => void;
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
  setInAppOnboardingActive: (active: boolean) => void;
  setInAppOnboardingFirstRun: (firstRun: boolean) => void;
  setTutorialComposerLock: (locked: boolean) => void;
  setActiveLessonId: (lessonId: string | null) => void;
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
  toggleTeamsSectionCollapsed: () => void;
  toggleMyAccountsSectionCollapsed: () => void;
  toggleWorkspaceSectionCollapsed: () => void;
  setFilePreview: (preview: FilePreviewTarget | null) => void;
  /**
   * Reset the ephemeral, identity-scoped view state to its initial values on an
   * identity change (HOU-903) — the outgoing account's open view, panels,
   * dialogs, and searches must not greet the next account. The persisted device
   * layout prefs (`sidebarCollapsed` and the three band folds)
   * are kept: they are per-machine, not per-account.
   */
  reset: () => void;
}

/** The initial data state, shared by the store's creator and `reset()` so the
 *  two can never drift. Excludes the action functions. */
const initialUIState = {
  viewMode: INBOX_VIEW_ID,
  settingsSection: null,
  activityPanelId: null,
  activityPanelForceOpen: false,
  claudeAvailable: null,
  authRequired: null,
  toasts: [],
  createAgentDialogOpen: false,
  createAgentTeamId: null,
  editTeamIdentityId: null,
  agentWarmingNoticeOpen: false,
  newMissionSheetOpen: false,
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
  inAppOnboardingActive: false,
  inAppOnboardingFirstRun: false,
  tutorialComposerLock: false,
  activeLessonId: null,
  shareAgentId: null,
  importFromFriendOpen: false,
  importSeedPreview: null,
  storeFocusSlug: null,
  storeOwnerTab: null,
  pendingStoreInstallSlug: null,
  storeCreatorHandle: null,
  creatorEditorOpen: false,
  sidebarCollapsed: false,
  teamsSectionCollapsed: false,
  myAccountsSectionCollapsed: false,
  workspaceSectionCollapsed: false,
  filePreview: null,
  activeTeamId: null,
  teamSection: null,
  teamAgentFilter: null,
  teamAgentFocus: false,
  teamSettingsFocus: false,
  agentsHomeAgentId: null,
  chatAgentId: null,
  chatMissionId: null,
  // The single-entry boot stack; its root mirrors the initial view fields
  // above (pinned by app/tests/ui-store-nav.test.ts).
  ...initialNavState(),
} satisfies Partial<UIState>;

/** Every navigation that is not the chat itself closes the pushed chat: the
 *  chat renders over ANY view, so a stale pair would keep it glued over the
 *  next screen. Spread into each nav-aware action's write. */
const noChat = { chatAgentId: null, chatMissionId: null };

let toastCounter = 0;
// Live dismiss timers by toast id, so a coalesced repeat can RESTART its
// toast's countdown (see addToast) and a manual dismiss cancels it.
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      ...initialUIState,

      navBack: () => get().navApplyHistory(get().navIndex - 1),
      navApplyHistory: (index) => {
        const s = get();
        const clamped = Math.max(0, Math.min(index, s.navStack.length - 1));
        if (clamped === s.navIndex) return;
        const entry = s.navStack[clamped];
        set({ navIndex: clamped, ...viewFieldsOf(entry) });
        // The panel closes through its OWNER (deselect and all), outside the
        // write above: the closer's own store writes then find the stack
        // already at the panel-less entry, so they fold in as no-ops instead
        // of double-popping. An entry WITH a panel can't reopen it — the
        // selection it derived from is gone (see NavEntry.panelOpen).
        if (!entry.panelOpen && get().missionPanelOpen) {
          const close = get().onPanelClose;
          if (close) close();
          else get().closeMissionPanel();
        }
      },
      setViewMode: (viewMode, opts) =>
        set((s) => navigated(s, { viewMode, ...noChat }, opts?.nav ?? "push")),
      openTeamView: (activeTeamId, teamSection, opts) => {
        const teamAgentFilter = opts?.agentFilter ?? null;
        const teamAgentFocus =
          opts?.agentFocus === true && teamAgentFilter !== null;
        set((s) =>
          navigated(
            s,
            {
              viewMode: TEAM_VIEW_ID,
              activeTeamId,
              teamSection,
              teamAgentFilter,
              teamAgentFocus,
              teamSettingsFocus:
                !teamAgentFocus && opts?.teamSettingsFocus === true,
              ...noChat,
            },
            opts?.nav ?? "push",
          ),
        );
      },
      setTeamAgentFilter: (teamAgentFilter) => set({ teamAgentFilter }),
      // Drilling INTO a section is a new place; back to the index is a
      // "back" (pops when the index is where the user came from).
      setSettingsSection: (settingsSection) =>
        set((s) =>
          navigated(
            s,
            { settingsSection },
            settingsSection === null ? "retreat" : "push",
          ),
        ),
      openSettings: (settingsSection, opts) =>
        set((s) =>
          navigated(
            s,
            { viewMode: "settings", settingsSection, ...noChat },
            opts?.nav ?? "push",
          ),
        ),
      openAgentsHome: (agentsHomeAgentId, opts) =>
        set((s) =>
          navigated(
            s,
            { viewMode: AGENTS_HOME_VIEW_ID, agentsHomeAgentId, ...noChat },
            opts?.nav ?? "push",
          ),
        ),
      openMissionChat: (chatAgentId, chatMissionId, opts) =>
        set((s) =>
          navigated(s, { chatAgentId, chatMissionId }, opts?.nav ?? "push"),
        ),
      closeMissionChat: () =>
        set((s) => navigated(s, { ...noChat }, "retreat")),
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

      setCreateAgentDialogOpen: (createAgentDialogOpen, teamId = null) =>
        set({
          createAgentDialogOpen,
          createAgentTeamId: createAgentDialogOpen ? teamId : null,
        }),

      setEditTeamIdentityId: (editTeamIdentityId) =>
        set({ editTeamIdentityId }),

      setAgentWarmingNoticeOpen: (agentWarmingNoticeOpen) =>
        set({ agentWarmingNoticeOpen }),
      setNewMissionSheetOpen: (newMissionSheetOpen) =>
        set({ newMissionSheetOpen }),

      setOnStartMission: (onStartMission) => set({ onStartMission }),
      setMissionPanelOwner: (ownerId, open) =>
        set((s) => {
          const missionPanelOwners = setPanelOwner(
            s.missionPanelOwners,
            ownerId,
            open,
          );
          if (missionPanelOwners === s.missionPanelOwners) return s;
          const missionPanelOpen = missionPanelOwners.length > 0;
          const partial = { missionPanelOwners, missionPanelOpen };
          // Only the panel's open/shut TRANSITIONS are navigation (a second
          // claim on an open panel is not a move): opening pushes a level the
          // back button can pop, the last release retreats it.
          if (missionPanelOpen === s.missionPanelOpen) return partial;
          return navigated(s, partial, missionPanelOpen ? "push" : "retreat");
        }),
      closeMissionPanel: () =>
        set((s) => {
          const partial = { missionPanelOwners: [], missionPanelOpen: false };
          // Same retreat as the last owner's release: closing the panel is a
          // "back" when the previous entry is this view without it.
          return s.missionPanelOpen
            ? navigated(s, partial, "retreat")
            : partial;
        }),
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
      // Arming the guided setup DISARMS any lesson: the setup is the one run
      // the user cannot be talked out of, and "Guide me" is reachable from the
      // rail while a lesson is playing over the very same app.
      setInAppOnboardingActive: (inAppOnboardingActive) =>
        set(
          inAppOnboardingActive
            ? { inAppOnboardingActive, activeLessonId: null }
            : { inAppOnboardingActive },
        ),
      setInAppOnboardingFirstRun: (inAppOnboardingFirstRun) =>
        set({ inAppOnboardingFirstRun }),
      setTutorialComposerLock: (tutorialComposerLock) =>
        set({ tutorialComposerLock }),
      setActiveLessonId: (activeLessonId) => set({ activeLessonId }),
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
      toggleTeamsSectionCollapsed: () =>
        set((s) => ({ teamsSectionCollapsed: !s.teamsSectionCollapsed })),
      toggleMyAccountsSectionCollapsed: () =>
        set((s) => ({
          myAccountsSectionCollapsed: !s.myAccountsSectionCollapsed,
        })),
      toggleWorkspaceSectionCollapsed: () =>
        set((s) => ({
          workspaceSectionCollapsed: !s.workspaceSectionCollapsed,
        })),
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
          teamsSectionCollapsed: s.teamsSectionCollapsed,
          myAccountsSectionCollapsed: s.myAccountsSectionCollapsed,
          workspaceSectionCollapsed: s.workspaceSectionCollapsed,
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
        teamsSectionCollapsed: state.teamsSectionCollapsed,
        myAccountsSectionCollapsed: state.myAccountsSectionCollapsed,
        workspaceSectionCollapsed: state.workspaceSectionCollapsed,
      }),
    },
  ),
);
