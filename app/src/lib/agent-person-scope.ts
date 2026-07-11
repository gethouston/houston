import type { KanbanPerson } from "@houston-ai/board";
import { missionMatchesPerson } from "./mission-people.ts";

/**
 * Pure, DOM-free model for the per-agent header PERSON SCOPE (the compact
 * dropdown beside the Share button that narrows an agent's board to one
 * person). No React, no store, no Supabase — so the default, the matching
 * semantics, the menu ordering, and the reset-on-agent-switch rule are all
 * unit-testable in isolation and shared verbatim by the header trigger
 * ({@link AgentPersonScopeMenu}) and the board filter ({@link useAgentBoardScope}).
 *
 * Three scopes:
 * - `me` (the DEFAULT): my missions plus anything nobody is stamped on;
 * - `everyone`: no filter at all;
 * - `person`: strict membership on one named teammate.
 */
export type PersonScope =
  | { kind: "me" }
  | { kind: "everyone" }
  | { kind: "person"; userId: string };

/**
 * The scope every agent board opens on. It is the SIGNED-IN USER, on purpose:
 * the default is the founder's teaching moment — it seeds the trigger with the
 * user's own face + name so they learn the dropdown exists and is theirs,
 * instead of a neutral "Everyone" that hides the control's meaning.
 */
export const DEFAULT_SCOPE: PersonScope = { kind: "me" };

/**
 * Reconcile a reused agent view's scope across agent switches.
 *
 * The scope provider wraps the agent view, but the view (and its provider
 * instance) is REUSED when the user switches agents. A person or "everyone"
 * chosen for the PREVIOUS agent is meaningless on the next one — a teammate may
 * not be on any of its missions, so the board would render empty under a
 * trigger showing a stranger. So on a path (agent) change the scope snaps back
 * to {@link DEFAULT_SCOPE} (me); with no switch it survives, since plain
 * re-renders and data refreshes must not silently drop the user's choice.
 *
 * The caller feeds the returned value both to state AND to the frame it renders,
 * so the reset lands before the filtered board commits (no one-frame flash of
 * the previous agent's scope). Mirrors the sibling render-phase reset in
 * {@link resolvePendingActivitySelection}.
 */
export function reconcileAgentScope({
  trackedPath,
  path,
  scope,
}: {
  /** Agent path this provider instance last reconciled to. */
  trackedPath: string;
  /** Agent path being rendered now. */
  path: string;
  /** The currently selected scope. */
  scope: PersonScope;
}): PersonScope {
  return trackedPath === path ? scope : DEFAULT_SCOPE;
}

/**
 * Does this mission belong under `scope` for the signed-in `selfId`?
 *
 * - `everyone`: always — the scope is a no-op, every mission shows.
 * - `person`: strict membership on that id, exactly as the cross-agent board
 *   ({@link missionMatchesPerson}).
 * - `me` (the DEFAULT): the mission's face stack includes me, OR the mission
 *   has NO attribution at all (an empty/absent face stack).
 *
 * The unattributed clause is load-bearing and must never be dropped. Missions
 * created before the gateway stamped `created_by` + `contributors` (legacy /
 * pre-Teams / any unstamped mission) carry no people. Because the board now
 * DEFAULTS to `me`, without this clause every such mission would vanish the
 * instant a user lands on the board — a long-tenured user would see an empty
 * board on day one of this change. Treating "nobody is stamped" as "mine by
 * default" keeps that history visible; a named person filter still excludes it
 * (only `everyone` and `me` show unattributed work).
 */
export function missionMatchesScope(
  people: KanbanPerson[] | undefined,
  scope: PersonScope,
  selfId: string,
): boolean {
  switch (scope.kind) {
    case "everyone":
      return true;
    case "person":
      return missionMatchesPerson(people, scope.userId);
    case "me":
      return (
        (people?.length ?? 0) === 0 || missionMatchesPerson(people, selfId)
      );
  }
}

/** One row the scope menu offers: a fixed scope + the person it renders, if any. */
export interface ScopeOption {
  scope: PersonScope;
  /** The teammate face for a `person` row; absent for `me` / `everyone`. */
  person?: KanbanPerson;
}

/**
 * The ordered scope menu, decided purely so the ordering is testable without
 * React: the signed-in user FIRST (the default, their own face), then Everyone,
 * then every OTHER contributor on this agent's items in roster order (self
 * removed — they are already the first row). The "Invite teammates" affordance
 * is a caller concern (it opens a share flow, not a scope) and is appended by
 * the menu itself, not here.
 */
export function buildScopeOptions(
  roster: KanbanPerson[],
  selfId: string,
): ScopeOption[] {
  return [
    { scope: DEFAULT_SCOPE },
    { scope: { kind: "everyone" } },
    ...roster
      .filter((p) => p.id !== selfId)
      .map((p) => ({
        scope: { kind: "person" as const, userId: p.id },
        person: p,
      })),
  ];
}
