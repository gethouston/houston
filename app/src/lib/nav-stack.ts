/**
 * The app's navigation stack: an explicit push-stack of screen-level locations
 * (tab → team board → chat panel), modeled in the ui store and mirrored into
 * the browser history by `lib/nav-history.ts` so back/forward (and Android's
 * hardware back) walk the app instead of leaving it.
 *
 * There is deliberately NO router: an entry is a snapshot of the store fields
 * that say where the user is, not a URL. The one-shot handoff fields
 * (`activityPanelId`, `pendingRoutineChat`, …) are excluded on purpose — they
 * are messages between surfaces, not places, and replaying one on back would
 * re-fire its side effect.
 *
 * Everything here is pure so the stack semantics are unit-testable; the store
 * (`stores/ui.ts`) is the only caller of `navigated`, and the history sync
 * layer is the only code in the app allowed to touch `history`.
 */

import type { SettingsSectionId } from "./settings-sections";
import type { TeamSectionId } from "./teams-model.ts";
import { INBOX_VIEW_ID } from "./top-level-views.ts";

/** One place the user has been, at screen granularity. */
export interface NavEntry {
  viewMode: string;
  settingsSection: SettingsSectionId | null;
  activeTeamId: string | null;
  teamSection: TeamSectionId | null;
  teamAgentFilter: string | null;
  teamAgentFocus: boolean;
  teamSettingsFocus: boolean;
  /**
   * Whether the shell detail panel (the chat) is open over the view. A panel
   * level can be POPPED (back closes the chat) but not re-entered: the panel
   * is derived from a surface's live selection, which a popped entry no longer
   * holds — forward into a panel entry restores the view and leaves the panel
   * closed.
   */
  panelOpen: boolean;
}

/** The stack plus the cursor: entries above `navIndex` are the forward set. */
export interface NavState {
  navStack: NavEntry[];
  navIndex: number;
}

/**
 * How a navigation lands on the stack:
 * - `push`: a new place (rail click, drill-in, panel open).
 * - `replace`: a redirect — the current entry never counts as a place the user
 *   chose (boot's Inbox→home hop, the dead-view guard's go-home).
 * - `retreat`: a "back"-flavored transition (Escape, a back bar, panel close).
 *   It POPS when the previous entry already is the destination, so the browser
 *   history retreats with the UI; anywhere else it replaces, because a close
 *   is not a new place and pushing it would make browser-back "reopen" what
 *   the user just dismissed.
 * - `reset`: a tab switch (the mobile tab bar). The stack REBUILDS to the
 *   destination as its only entry — native tab semantics: changing tabs
 *   abandons the old tab's trail rather than stacking on top of it. The
 *   history mirror echoes a rebuild as `replaceState`, and the browser's now
 *   meaningless deeper entries decay onto the fresh root via the clamp.
 */
export type NavMode = "push" | "replace" | "retreat" | "reset";

/** The store fields a {@link NavEntry} snapshots. */
export interface NavSourceFields {
  viewMode: string;
  settingsSection: SettingsSectionId | null;
  activeTeamId: string | null;
  teamSection: TeamSectionId | null;
  teamAgentFilter: string | null;
  teamAgentFocus: boolean;
  teamSettingsFocus: boolean;
  missionPanelOpen: boolean;
}

export function navEntryOf(s: NavSourceFields): NavEntry {
  return {
    viewMode: s.viewMode,
    settingsSection: s.settingsSection,
    activeTeamId: s.activeTeamId,
    teamSection: s.teamSection,
    teamAgentFilter: s.teamAgentFilter,
    teamAgentFocus: s.teamAgentFocus,
    teamSettingsFocus: s.teamSettingsFocus,
    panelOpen: s.missionPanelOpen,
  };
}

export function sameNavEntry(a: NavEntry, b: NavEntry): boolean {
  return (
    a.viewMode === b.viewMode &&
    a.settingsSection === b.settingsSection &&
    a.activeTeamId === b.activeTeamId &&
    a.teamSection === b.teamSection &&
    a.teamAgentFilter === b.teamAgentFilter &&
    a.teamAgentFocus === b.teamAgentFocus &&
    a.teamSettingsFocus === b.teamSettingsFocus &&
    a.panelOpen === b.panelOpen
  );
}

/**
 * The entry's fields as a store write, minus `panelOpen`: the panel is owned
 * by surface claims (`detail-panel-owners.ts`), so applying an entry writes the
 * view fields and lets the caller close the panel through its owner.
 */
export function viewFieldsOf(entry: NavEntry): Omit<NavEntry, "panelOpen"> {
  const { panelOpen: _panelOpen, ...fields } = entry;
  return fields;
}

/**
 * The boot stack: one entry, the Inbox — the same honest landing the store's
 * initial `viewMode` names. A refresh re-boots to this single entry on
 * purpose (`viewMode` is deliberately not persisted); pre-refresh history
 * entries decay to it (`nav-history.ts`).
 */
export function initialNavState(): NavState {
  return {
    navStack: [
      navEntryOf({
        viewMode: INBOX_VIEW_ID,
        settingsSection: null,
        activeTeamId: null,
        teamSection: null,
        teamAgentFilter: null,
        teamAgentFocus: false,
        teamSettingsFocus: false,
        missionPanelOpen: false,
      }),
    ],
    navIndex: 0,
  };
}

/**
 * Fold a navigation write into the stack: returns `partial` untouched when the
 * resulting location is the one already current (a re-click is not a move),
 * otherwise `partial` plus the updated stack per {@link NavMode}. A push
 * truncates the forward set, exactly as the browser's own `pushState` will.
 */
export function navigated<P extends object>(
  s: NavSourceFields & NavState,
  partial: P,
  mode: NavMode,
): P | (P & NavState) {
  const resulting = navEntryOf({ ...s, ...partial });
  const current = s.navStack[s.navIndex];
  if (mode === "reset") {
    // Before the re-click check: landing on the current location must STILL
    // rebuild when older entries sit beneath it, or the abandoned trail would
    // stay walkable. Only a stack that already is the bare root is a no-op.
    if (s.navStack.length === 1 && sameNavEntry(resulting, current))
      return partial;
    return { ...partial, navStack: [resulting], navIndex: 0 };
  }
  if (sameNavEntry(resulting, current)) return partial;
  if (mode === "push") {
    return {
      ...partial,
      navStack: [...s.navStack.slice(0, s.navIndex + 1), resulting],
      navIndex: s.navIndex + 1,
    };
  }
  if (mode === "retreat") {
    const previous = s.navIndex > 0 ? s.navStack[s.navIndex - 1] : null;
    if (previous !== null && sameNavEntry(previous, resulting)) {
      // The stack array is deliberately UNCHANGED on a pop: the history sync
      // layer distinguishes a pop (mirror with `history.go`) from a rebuild
      // (mirror with `replaceState`) by the array's identity.
      return { ...partial, navStack: s.navStack, navIndex: s.navIndex - 1 };
    }
  }
  const navStack = s.navStack.slice();
  navStack[s.navIndex] = resulting;
  return { ...partial, navStack, navIndex: s.navIndex };
}
