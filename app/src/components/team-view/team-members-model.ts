import type { AgentTeamMember, OrgMember } from "@houston-ai/engine-client";
import { canLeaveTeam, type TeamView } from "../../lib/teams-model.ts";
import { memberLabel } from "../organization/people-tab-model.ts";

/**
 * Pure, DOM-free logic behind Team Settings' Members card (C13): which face the
 * card wears, how an explicit membership row becomes a person you recognise,
 * and what the caller may do to their own membership. Extracted so every rule
 * below is unit-tested under bare node, never importing React.
 *
 * The one thing it deliberately does NOT resolve is the avatar image: a face is
 * a lookup into a React query's map, not a decision, and the card resolves it
 * with `avatarUrlFromProfiles` exactly like every other people row in the app.
 *
 * Affordance logic only. The gateway is the sole enforcer, and each refusal it
 * can still answer with is an expected state the write hooks already surface.
 */

/** The roster fields naming a person needs: the org read's members, narrowed so
 *  the card (and a test) hands over only what it actually reads. */
export type TeamRosterPerson = Pick<OrgMember, "userId" | "email">;

/** One person in the team's Members card. */
export interface TeamMemberRow {
  userId: string;
  /** Their email off the org roster, else the raw id, so a member the roster
   *  read never returned (a plain member cannot list the org) still renders as
   *  a row instead of a blank. */
  name: string;
  owner: boolean;
  isSelf: boolean;
  /** Whether THIS row carries the owner/remove control. */
  editable: boolean;
}

/**
 * Order: owners first (the people who can change the team read before the
 * people who cannot), the caller's own row first inside its band (you find
 * yourself without scanning), then by name so the list is stable across
 * refetches, with the id as the last tiebreak for two identical names.
 */
function compareMemberRows(a: TeamMemberRow, b: TeamMemberRow): number {
  if (a.owner !== b.owner) return a.owner ? -1 : 1;
  if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1;
  const byName = a.name.localeCompare(b.name, undefined, {
    sensitivity: "base",
  });
  return byName !== 0 ? byName : a.userId.localeCompare(b.userId);
}

/**
 * The team's EXPLICIT membership rows joined to the org roster.
 *
 * The caller's OWN row is never editable, on purpose: demoting or removing
 * yourself here would be the same wire call as leaving, and the card already
 * offers Leave as one deliberate action, named for what it does. It mirrors the
 * org People tab, which also refuses self-edits.
 */
export function buildTeamMemberRows(input: {
  members: readonly AgentTeamMember[];
  roster: readonly TeamRosterPerson[];
  selfId: string | null;
  /** The card's write gate (see {@link teamMembersView}). */
  readOnly: boolean;
}): TeamMemberRow[] {
  const byId = new Map(input.roster.map((person) => [person.userId, person]));
  const rows = input.members.map((member) => {
    const person = byId.get(member.userId);
    const isSelf = member.userId === input.selfId;
    return {
      userId: member.userId,
      name: person ? memberLabel(person) : member.userId,
      owner: member.owner,
      isSelf,
      editable: !input.readOnly && !isSelf,
    };
  });
  return rows.sort(compareMemberRows);
}

/** Which face the Members card wears for this team and this caller. */
export interface TeamMembersView {
  /** The card exists at all. It does not on the local sidebar backend (absent
   *  `server` facts, where a team is one person's grouping), nor in a PERSONAL
   *  space, which holds exactly one human and therefore has no people to
   *  manage. */
  visible: boolean;
  /** Read the membership rows. False on the default team, which holds no
   *  explicit rows at all. */
  showRoster: boolean;
  /** Rows are static labels, no controls. */
  readOnly: boolean;
  /** The default team explains itself INSTEAD of listing a roster. */
  showDefaultNote: boolean;
  /** Whenever a roster is served, say that the space's owners and managers run
   *  every team without appearing in it: the list is explicit rows only, and an
   *  admin reading it would otherwise conclude nobody is in charge. */
  showAdminNote: boolean;
}

/**
 * A PERSONAL space has NO members card, on any of its teams. It holds exactly
 * one human, so there is nobody to add, promote or remove, and the gateway
 * answers all three member-management routes `403 personal_space` (C13
 * §Personal spaces). Rendering the card there would offer a roster of one and a
 * Leave button onto a refusal — the only 403 a solo user could reach in this
 * whole surface. Its Team Settings keeps the name field and the agents, which
 * is exactly what a team means to somebody working alone.
 *
 * The default team is READ-ONLY by the wire, not by taste: every member write
 * on it answers `400 default_team`, because everyone in the space is already in
 * it and it keeps no rows to write. So it shows its note where the others show
 * a roster, and never fires the membership read at all.
 */
export function teamMembersView(
  team: TeamView,
  /** Whether the ACTIVE space is a personal one (`usePersonalSpace`, over
   *  `isPersonalSpace` in `lib/org-roles`). */
  personalSpace: boolean,
): TeamMembersView {
  const server = team.server;
  if (server === undefined || personalSpace) {
    return {
      visible: false,
      showRoster: false,
      readOnly: true,
      showDefaultNote: false,
      showAdminNote: false,
    };
  }
  const showRoster = !team.isDefault;
  return {
    visible: true,
    showRoster,
    readOnly: !showRoster || !server.owner,
    showDefaultNote: team.isDefault,
    showAdminNote: showRoster,
  };
}

/**
 * The user id the card's Leave button would send, or `null` when it offers no
 * Leave at all. Leaving is `DELETE .../members/:userId` on YOURSELF, so with no
 * session there is no id to name and the button must not render: firing a call
 * we cannot address would fail for a reason the user could do nothing about.
 *
 * There is deliberately no Join counterpart, even though an unjoined team's
 * screen now renders (joining is sidebar PINNING and grants nothing, so nothing
 * gates the view on it). This card's writes are owner-gated and the default
 * team shows its note instead of a roster; joining stays one deliberate act in
 * one place, the "Join a team" submenu of the rail's create menu, which is also
 * where Leave puts a team straight back.
 */
export function teamLeaveUserId(
  team: TeamView,
  selfId: string | null,
  /** Whether the ACTIVE space is a personal one (`usePersonalSpace`). The card
   *  does not render there at all, but the gate is asked in full anyway: a call
   *  site that answers a permission question with a hardcoded `false` is how
   *  the rail ended up offering Leave in a personal space. */
  personalSpace: boolean,
): string | null {
  if (selfId === null || !canLeaveTeam(team, personalSpace)) return null;
  return selfId;
}

/**
 * The gateway's ceiling on a team name: `1..60` RUNES after trimming (C13, and
 * `validName` in the fake host). Written down once here so the input cap and
 * the sidebar rename input can never drift from it.
 */
export const TEAM_NAME_MAX_RUNES = 60;

/**
 * Truncate `value` to at most `max` RUNES — Unicode code points, the unit the
 * gateway counts in, NOT the UTF-16 code units an `maxLength` attribute or
 * `String.slice` works in. Sixty emoji are a name the gateway accepts and 120
 * code units, so a UTF-16 cap would cut it in half; slicing code units would
 * also leave a lone surrogate behind. Spreading the string iterates code
 * points, so neither can happen.
 */
export function clampToRunes(value: string, max: number): string {
  if (!(max > 0)) return "";
  const runes = [...value];
  return runes.length <= max ? value : runes.slice(0, max).join("");
}
