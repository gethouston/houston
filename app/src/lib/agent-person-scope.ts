import type { KanbanPerson } from "@houston-ai/board";
import { missionMatchesPerson } from "./mission-people.ts";

/**
 * Pure, DOM-free model for the per-agent header PERSON SCOPE (the compact
 * dropdown beside the Share button that narrows an agent's board to one
 * person). No React, no store, no Supabase — so the default, the matching
 * semantics and the menu ordering are all
 * unit-testable in isolation and shared verbatim by the header trigger
 * ({@link AgentPersonScopeMenu}) and the board filter ({@link useAgentBoardScope}).
 *
 * Three scopes:
 * - `everyone` (the DEFAULT): no filter at all;
 * - `me`: my missions plus anything nobody is stamped on;
 * - `person`: strict membership on one named teammate.
 */
export type PersonScope =
  | { kind: "me" }
  | { kind: "everyone" }
  | { kind: "person"; userId: string };

/**
 * The scope every agent board opens on. It is EVERYONE, on purpose: a board
 * must open showing all of the agent's work, so nothing a teammate did can be
 * hidden by a filter the user never chose. Narrowing to yourself is an explicit
 * act, exactly as on the cross-agent Mission Control board (which has always
 * opened on Everyone) — one mental model for both boards.
 */
export const DEFAULT_SCOPE: PersonScope = { kind: "everyone" };

/**
 * Does this mission belong under `scope` for the signed-in `selfId`?
 *
 * - `everyone` (the DEFAULT): always — the scope is a no-op, every mission
 *   shows.
 * - `person`: strict membership on that id, exactly as the cross-agent board
 *   ({@link missionMatchesPerson}).
 * - `me`: the mission's face stack includes me, OR the mission has NO
 *   attribution at all (an empty/absent face stack).
 *
 * The unattributed clause is load-bearing and must never be dropped. Missions
 * created before the gateway stamped `created_by` + `contributors` (legacy /
 * pre-Teams / any unstamped mission) carry no people, and off multiplayer NO
 * mission carries any. Without this clause, picking `me` would blank the board
 * for a long-tenured user and hide every single-player mission. Treating
 * "nobody is stamped" as "mine by default" keeps that history visible; a named
 * person filter still excludes it (only `everyone` and `me` show unattributed
 * work). {@link missionIsMine} reuses the `me` scope for exactly that rule, so
 * it must stay independent of which scope the board happens to open on.
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
 * React: Everyone FIRST (the default, and the widest view — the row you return
 * to), then the signed-in user, then every OTHER contributor on this agent's
 * items in roster order (self removed — they are already the second row). Same
 * order as the cross-agent Mission Control filter. The "Invite teammates"
 * affordance is a caller concern (it opens a share flow, not a scope) and is
 * appended by the menu itself, not here.
 */
export function buildScopeOptions(
  roster: KanbanPerson[],
  selfId: string,
): ScopeOption[] {
  return [
    { scope: DEFAULT_SCOPE },
    { scope: { kind: "me" } },
    ...roster
      .filter((p) => p.id !== selfId)
      .map((p) => ({
        scope: { kind: "person" as const, userId: p.id },
        person: p,
      })),
  ];
}
