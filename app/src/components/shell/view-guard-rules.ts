/**
 * The two decisions behind the shell's view guards, as pure functions.
 *
 * `useWorkspaceViewGuards` owns the EFFECTS (reading the stores, writing the
 * view); what it must decide is here, so the two rules that used to be
 * unreadable one-liners inside a `useEffect` can be stated once and pinned by
 * `app/tests/view-guard-rules.test.ts`.
 */

import { blockedTeamView, type TeamView } from "../../lib/teams-model.ts";
import {
  blockedTopLevelView,
  INBOX_VIEW_ID,
  isTopLevelView,
} from "../../lib/top-level-views.ts";

/** What the guard remembers between renders about booting one workspace. */
export interface BootGuardState {
  /**
   * The workspace the guard is tracking. `undefined` before the first run,
   * which is deliberately distinct from `null` (a resolved "no workspace"), so
   * the very first render arms instead of looking already-booted.
   */
  workspaceId: string | null | undefined;
  /** Whether boot may still move this workspace's landing. */
  armed: boolean;
}

export const INITIAL_BOOT_GUARD: BootGuardState = {
  workspaceId: undefined,
  armed: false,
};

export type BootGuardAction = "wait" | "open-home-team";

/**
 * One step of the boot rule: the app starts on the Inbox, and the moment the
 * first team resolves it moves to that team's Mission Control.
 *
 * Three things have to hold at once, which is why this is a small machine
 * rather than a condition:
 *
 * - **One shot per workspace.** Once boot has moved the user (or decided not
 *   to), it never fires again for that workspace.
 * - **Re-armed when the workspace changes.** Each space boots into its OWN
 *   first team. The view open on the tick the id changes belongs to the space
 *   the user just LEFT, so that tick only arms: reading it as "the user
 *   navigated" would disarm every space switch before its new landing was even
 *   set, and `create-team-dialog`'s `openHome()` (which lands on the Inbox
 *   while the new space's teams are still in flight) would strand the user
 *   there.
 * - **The user always wins.** A view other than the Inbox, on any tick after
 *   the arming one, means the user moved during the teams read. Boot disarms
 *   rather than yanking them out of what they opened.
 *
 * With no team resolved yet the Inbox simply stands and the guard stays armed,
 * so the first team to land is what moves the user on.
 */
export function bootGuardStep(
  state: BootGuardState,
  input: { workspaceId: string | null; viewMode: string; hasHomeTeam: boolean },
): { state: BootGuardState; action: BootGuardAction } {
  if (state.workspaceId !== input.workspaceId) {
    return {
      state: { workspaceId: input.workspaceId, armed: true },
      action: "wait",
    };
  }
  if (!state.armed) return { state, action: "wait" };
  if (input.viewMode !== INBOX_VIEW_ID) {
    return { state: { ...state, armed: false }, action: "wait" };
  }
  if (!input.hasHomeTeam) return { state, action: "wait" };
  return { state: { ...state, armed: false }, action: "open-home-team" };
}

export type DeadViewAction = "keep" | "wait" | "go-home";

/**
 * Whether the open view still exists — and, when it does not, whether that is
 * genuinely stale or merely in flight.
 *
 * A `viewMode` no screen answers to, a view this caller's gates hide (the AI
 * Models hub for a plain member, Admin outside a team space or below
 * owner/admin), or a team that stopped existing under an open team view all
 * fall through every render branch and strand the user on a blank card. Those
 * go home.
 *
 * A GATED view whose gates have not resolved yet WAITS. The gates are computed
 * from `capabilities`, which is null until the fetch lands, so every one of them
 * reads false in that window: acting on it would bounce a user off the very
 * screen they persisted, on every boot and every space switch — and a team-space
 * switch drops the capabilities query outright, so the window is deterministic
 * rather than theoretical.
 *
 * The other exception is a dead TEAM view in a workspace with NO teams at all:
 * the server-backed teams read answers `[]` on its first pass, so "the team you
 * are on does not exist" is indistinguishable from "the teams have not arrived
 * yet" — and bouncing there throws the user off the very team about to land.
 * The guard waits it out; the team either resolves (nothing happened) or the
 * list arrives without it (this rule then sends them home). A `viewMode` that
 * is not a top-level view at all carries no such ambiguity: no teams read can
 * ever make it valid, so it goes home even with no teams, and home with no
 * teams is the Inbox.
 */
export function deadViewStep(input: {
  viewMode: string;
  showAiModels: boolean;
  showOrganization: boolean;
  /** False while the capabilities behind the gates are still loading. */
  gatesReady: boolean;
  teams: TeamView[];
  activeTeamId: string | null;
}): DeadViewAction {
  const teamDead = blockedTeamView(
    input.viewMode,
    input.teams,
    input.activeTeamId,
  );
  const gateDead = blockedTopLevelView(input.viewMode, {
    showAiModels: input.showAiModels,
    showOrganization: input.showOrganization,
  });
  if (gateDead && !input.gatesReady) return "wait";
  const dead = !isTopLevelView(input.viewMode) || gateDead || teamDead;
  if (!dead) return "keep";
  if (teamDead && input.teams.length === 0) return "wait";
  return "go-home";
}
