import type {
  AddOrgMemberResult,
  OrgMember,
  OrgRole,
} from "@houston/engine-adapter";

/**
 * Pure, DOM-free logic for the Organization > People tab (Teams v2). Extracted
 * so the who-can-edit-whom rules, the add-result branch, and the avatar/label
 * derivations are unit-tested in isolation (node:test), never importing React.
 * The gateway is the real enforcer; these gates only hide affordances a caller
 * can't act on.
 */

/**
 * The ONE rule for naming a person on screen, wherever they appear: the name
 * they set, else the email the gateway exposes to this caller, else whatever
 * the surface has left to say (a shortened id in a feed, a translated stand-in
 * in the org chart). Never a raw uuid unless the caller chooses one — an
 * opaque id names nobody.
 */
export function personDisplayName(
  member: Pick<OrgMember, "displayName" | "email" | "userId">,
  fallback: string,
): string {
  // A blank or whitespace-only value names nobody, so it counts as ABSENT: the
  // gateway stores what a person typed, and a name of spaces would otherwise
  // win over the email and leave the row rendering an empty line.
  const named = (value: string | null | undefined) => {
    const trimmed = value?.trim();
    return trimmed === "" ? undefined : trimmed;
  };
  return named(member.displayName) ?? named(member.email) ?? fallback;
}

/**
 * How a member ROW names its person, in its visible line and in the labels a
 * screen reader reads from the controls beside it alike — one name per row, or
 * the screen says one thing and announces another.
 *
 * It is {@link personDisplayName} with the row's own last resort: a row is
 * keyed by user id, so the id is all that is left when the gateway exposed
 * neither a name nor an email to this caller.
 */
export function rosterPersonName(
  member: Pick<OrgMember, "displayName" | "email" | "userId">,
): string {
  return personDisplayName(member, member.userId);
}

/**
 * Up to two uppercase initials for an avatar fallback, derived from an email
 * local part or a raw name/id. Splits on the usual separators (`.`, `-`, `_`,
 * `+`, whitespace); falls back to the first two characters when there's only
 * one token, and to `?` for an empty source so the badge is never blank.
 */
export function initialsFor(source: string): string {
  const at = source.indexOf("@");
  const base = at > 0 ? source.slice(0, at) : source;
  const parts = base.split(/[.\-_+\s]+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? parts
          .slice(0, 2)
          .map((p) => p[0])
          .join("")
      : base.slice(0, 2);
  return letters.toUpperCase() || "?";
}

/**
 * Can the viewer re-role or remove this member row? Owners only (`canManage`),
 * never themselves (no self-demotion/self-remove from the UI). Other OWNER rows
 * are editable too — an org may hold several owners, and demoting or removing
 * one is legal as long as at least one remains; the gateway's race-safe
 * `last_owner` 409 is the floor and surfaces as a plain informational toast.
 */
export function canEditMember(opts: {
  canManage: boolean;
  isSelf: boolean;
  role: OrgRole;
}): boolean {
  return opts.canManage && !opts.isSelf;
}

/**
 * Does this role change hand out OWNER authority — full org control including
 * membership and billing? Both grant surfaces (the add/invite row and the
 * roster's role select) confirm-gate exactly this transition; every other
 * change (including demoting an owner) applies directly, since the gateway
 * guards the only dangerous case (`last_owner`).
 */
export function grantsOwner(next: OrgRole, current?: OrgRole): boolean {
  return next === "owner" && current !== "owner";
}

/**
 * Which confirmation the add form should show after `POST /org/members`. A known
 * Houston user is added directly (`added`); an unknown email creates a pending
 * invite instead (host answers `202 {invited:true}`) → `invited`. The email is
 * echoed so the copy can name who was added/invited.
 */
export type AddOutcome =
  | { kind: "added"; email: string }
  | { kind: "invited"; email: string };

export function describeAddResult(
  email: string,
  result: AddOrgMemberResult,
): AddOutcome {
  const kind = result.invited ? "invited" : "added";
  return { kind, email: result.email ?? email };
}

/**
 * Human label for who sent a pending invite: the inviter's email if they're in
 * the roster we already loaded, else their raw id (an inviter who has since
 * left). Data-only (no i18n) so the caller wraps it in a translated template.
 */
export function inviterLabel(
  invitedBy: string,
  members: readonly OrgMember[],
): string {
  return members.find((m) => m.userId === invitedBy)?.email ?? invitedBy;
}
