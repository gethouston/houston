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
   * The open top-level screen (`lib/top-level-views.ts`). It starts as the
   * AGENTS HOME: there is no global mission board any more, so the app's home
   * is the first team's Mission Control and no team has resolved on the first
   * paint. The Agents home needs none, which makes it the honest landing — and
   * `use-workspace-view-guards.ts`'s boot rule moves the user on to home the
   * moment the first team lands.
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
  /**
   * The open team view (`viewMode === TEAM_VIEW_ID`): which team and which of
   * its sections (mission-control / routines / files / settings). Set together
   * through {@link NavActions.openTeamView} so the view is always coherent.
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
  setAgentsHomeTeamId: (teamId: string | null) => void;
  /**
   * Navigate to the phone's Teams home: the tree of every team and its
   * sections, the Teams tab's root. A team's section is one push below it
   * (`openTeamView`), so its back chip retreats here.
   */
  openTeamsHome: (opts?: {
    /** `reset` for the mobile nav bar, `retreat` for a back chip; default
     *  `push`. */
    nav?: NavMode;
  }) => void;
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
  activeTeamId: null,
  teamSection: null,
  teamAgentFilter: null,
  teamAgentFocus: false,
  teamSettingsFocus: false,
  agentsHomeAgentId: null,
  agentsHomeTeamId: null,
  chatAgentId: null,
  chatMissionId: null,
  // The single-entry boot stack; its root mirrors the initial view fields
  // above (pinned by app/tests/ui-store-nav.test.ts).
  ...initialNavState(),
} satisfies NavFields;
