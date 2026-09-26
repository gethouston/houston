import {
  initialNavState,
  type NavEntry,
  type NavMode,
} from "../../lib/nav-stack.ts";
import type { SettingsSectionId } from "../../lib/settings-sections";
import type { TeamSectionId } from "../../lib/teams-model.ts";
import { AGENTS_HOME_VIEW_ID } from "../../lib/top-level-views.ts";

/** The navigation slice's data: the open place and the stack behind it. */
export interface NavFields {
  /**
   * The open top-level screen (`lib/top-level-views.ts`). It starts on Agents
   * home while the roster and sidebar layout resolve. On desktop the boot
   * guard replaces it with the first employee's Tasks screen; on the phone it
   * remains the Agents tab root.
   */
  viewMode: string;
  /**
   * Which Settings section is open (`null` = the Settings index). The single
   * source of truth, not a one-shot pin: `SettingsView` renders from it and
   * writes it on drill-in/back, and every surface that navigates INTO Settings
   * goes through {@link NavActions.openSettings}, which sets the section and the
   * view together. That is what makes "open Settings" deterministic — clicking
   * Settings in the sidebar while a section is open lands on the index instead
   * of doing nothing.
   */
  settingsSection: SettingsSectionId | null;
  /** The open employee and section of their own screen. */
  activeAgentId: string | null;
  agentSection: TeamSectionId | null;
  /**
   * The agent the mobile Agents home screen is drilled into (`null` = the
   * agent list). Part of every nav entry so the drill-in is a real place the
   * back button pops; set only through {@link NavActions.openAgentsHome}.
   */
  agentsHomeAgentId: string | null;
  /**
   * The team the mobile Agents home is narrowed to (`null` = every team). A
   * plain preference, NOT a nav level: it survives drilling into an agent and
   * back, and the back button never has to undo a filter choice.
   */
  agentsHomeTeamId: string | null;
  /**
   * The phone's pushed mission-chat screen (`lib/nav-stack.ts` documents the
   * pair's semantics): the owning agent, and the open mission or `null` for an
   * empty draft chat. Set only through {@link NavActions.openMissionChat} /
   * {@link NavActions.closeMissionChat}; every OTHER navigation write clears
   * the pair, so navigating under an open chat closes it.
   */
  chatAgentId: string | null;
  chatMissionId: string | null;
  /**
   * The navigation stack (`lib/nav-stack.ts`): every screen-level location the
   * user has visited, with `navIndex` as the cursor. The nav-aware actions
   * fold their writes in (`navigated`), and `lib/nav-history.ts` mirrors
   * the pair into browser history — the ONLY code that touches `history` — so
   * back/forward walk the app. Not persisted: a refresh re-boots to one entry.
   */
  navStack: NavEntry[];
  navIndex: number;
}

export interface NavActions {
  /** Pop one level — the programmatic equivalent of the browser back button. */
  navBack: () => void;
  /**
   * Jump the stack to `index` (clamped) and apply that entry, closing the
   * detail panel through its owner when the entry has none. For the history
   * sync layer's popstate handler and {@link NavActions.navBack} only.
   */
  navApplyHistory: (index: number) => void;
  setViewMode: (mode: string, opts?: { nav?: NavMode }) => void;
  /** Open one employee's screen and section in a single navigation write. */
  openAgentView: (
    agentId: string,
    section: TeamSectionId,
    opts?: {
      /** `replace` for redirects (boot, dead-view guard); default `push`. */
      nav?: NavMode;
    },
  ) => void;
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
  setAgentsHomeTeamId: (teamId: string | null) => void;
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
}

export const navInitialState = {
  viewMode: AGENTS_HOME_VIEW_ID,
  settingsSection: null,
  activeAgentId: null,
  agentSection: null,
  agentsHomeAgentId: null,
  agentsHomeTeamId: null,
  chatAgentId: null,
  chatMissionId: null,
  // The single-entry boot stack; its root mirrors the initial view fields
  // above (pinned by app/tests/ui-store-nav.test.ts).
  ...initialNavState(),
} satisfies NavFields;
