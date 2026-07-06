import type {
  AddOrgMemberResult,
  OrgMember,
  OrgRole,
} from "@houston-ai/engine-client";

/**
 * Pure, DOM-free logic for the Organization > People tab (Teams v2). Extracted
 * so the who-can-edit-whom rules, the add-result branch, and the avatar/label
 * derivations are unit-tested in isolation (node:test), never importing React.
 * The gateway is the real enforcer; these gates only hide affordances a caller
 * can't act on.
 */

/** Human-facing identity for a member row: their email, else their raw id. */
export function memberLabel(
  member: Pick<OrgMember, "email" | "userId">,
): string {
  return member.email ?? member.userId;
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
 * never themselves (no self-demotion/self-remove from the UI), and never
 * another owner (ownership transfer is out of scope for v1; the gateway also
 * guards the last-owner case with a 409).
 */
export function canEditMember(opts: {
  canManage: boolean;
  isSelf: boolean;
  role: OrgRole;
}): boolean {
  return opts.canManage && !opts.isSelf && opts.role !== "owner";
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
