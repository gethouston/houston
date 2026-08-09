import type { TeamView } from "../../lib/teams-model.ts";

/**
 * WHERE a team's shared context is stored, and therefore which editor the card
 * mounts. Three answers, one per backend, resolved from the team alone so the
 * decision unit-tests under bare Node (`app/tests/team-context-model.test.ts`).
 *
 * The mechanism is not new in any of them — the card is a new FACE on the paths
 * that already deliver context to an agent's prompt:
 *
 *  - `group` — a named LOCAL team. Its context is the stored sidebar group's
 *    `context`, which the host mirrors to every member agent's `GROUP.md` on the
 *    layout write (`routes/group-context-sync.ts`).
 *  - `default` — the LOCAL default team, which is virtual and owns no group row,
 *    so its context is the layout's own `defaultContext`. The host fans THAT out
 *    to every ungrouped agent's `GROUP.md` on the same write — the identical
 *    mechanism, which is the only way "every agent in this team knows this" is
 *    true of a team with more than one agent in it.
 *  - `server` — an `agentTeams` host. The gateway owns the field and delivers it
 *    to the team's engine pods.
 */
export type TeamContextSource =
  | { kind: "group"; content: string }
  | { kind: "default"; content: string }
  | { kind: "server"; content: string };

/**
 * Which context store this team's card edits, or `null` for "this team has no
 * shared context to edit" — the ONE reason to render nothing at all.
 *
 * That `null` exists for exactly one situation: a SERVER team on a gateway that
 * does not serve the field yet. `context` is a text column with an empty
 * default there, so a gateway that has it sends the key for every team (`""`
 * when nobody wrote one) and only an older one omits it. Offering the editor
 * against such a gateway would promise the user an injection no agent would
 * ever receive, and every save would be a `400`.
 *
 * The two LOCAL branches never answer `null`: both of their stores exist on
 * every desktop install, so an absent value there means only that nobody has
 * written a context yet, which is an EMPTY editor and not a missing one.
 *
 * `defaultContext` is passed in rather than read off the team because the
 * VIRTUAL default team carries no fields of its own (`resolveTeams`): its
 * context lives on the layout, beside the `defaultCollapsed` that is there for
 * exactly the same reason. It is required, not optional, so a new caller has to
 * decide what it holds instead of silently rendering an empty box.
 */
export function teamContextSource(
  team: TeamView,
  defaultContext: string | undefined,
): TeamContextSource | null {
  if (team.server === undefined) {
    return team.isDefault
      ? { kind: "default", content: defaultContext ?? "" }
      : { kind: "group", content: team.context ?? "" };
  }
  return "context" in team
    ? { kind: "server", content: team.context ?? "" }
    : null;
}

/**
 * May the caller EDIT this team's context, as opposed to reading it? The same
 * question a rename asks, and answered the same way (`canRenameTeam`): changing
 * what every agent of a team is told is a team-owner power on a server host,
 * and the gateway is the real enforcer of it.
 *
 * Locally it is always true, which is where this parts from `canRenameTeam`:
 * that gate refuses the default team because nothing in the stack can rename a
 * workspace, not because the caller lacks the authority. A local install holds
 * one person, every team in it is their own, and the workspace context they
 * would be denied here is the very content they have always edited by hand.
 *
 * An affordance gate only. Anyone who can open the page still SEES the context —
 * knowing what your team's agents are told is not a privilege — they simply get
 * the read-only face.
 */
export function canEditTeamContext(team: TeamView): boolean {
  return team.server ? team.server.owner : true;
}
