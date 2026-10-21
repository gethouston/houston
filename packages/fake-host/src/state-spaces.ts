/**
 * C8 Spaces state — the CROSS-org surface `GET /v1/orgs` serves: every team the
 * caller belongs to, plus every pending invite addressed to them (the
 * invitee-side inbox the sidebar renders under its top line).
 *
 * Memberships have ONE source of truth here: the armed team-space rows
 * (`state.teamWorkspaces` — the same rows `GET /v1/workspaces` bridges). So
 * accepting an invite appends a row and the team appears in the switcher AND in
 * the org list at once, exactly as it does behind the real gateway, with no
 * second fixture to keep in sync.
 *
 * A PERSONAL `OrgSummary` is listed only while the plan is armed
 * (`PERSONAL_ORG_SLUG`, carrying the armed summary as org billing): the fake
 * host's personal space is the seed WORKSPACE, not an org record, and the
 * billing is the one thing a client reads off the personal org. Every other
 * client surface filters this list to `kind:"team"` (the team picker) or
 * matches the ACTIVE team's slug (the degraded banner).
 *
 * The `FakeSpaceInvite` / `SpaceInviteRejection` shapes live in
 * `state-store.ts` with the rest of the wire fixtures; this module is their
 * read/write surface, mirroring `state-teams.ts`.
 */

import type {
  CreateOrgOutcome,
  FreeOrg,
  OrgPlan,
  OrgSummary,
} from "@houston/wire-types";
import {
  PERSONAL_ORG_SLUG,
  planFreeOrg,
  planOrgBilling,
  unpaidOrgBilling,
} from "./state-org-billing";
import { FAKE_CHECKOUT_URL, planSeed } from "./state-plan";
import type {
  FakeSpaceInvite,
  FakeTeamWorkspace,
  OrgRole,
} from "./state-store";
import { state } from "./state-store";

/** One membership as `GET /v1/orgs` serves it. */
export type OrgSummaryWire = OrgSummary;

/** One invite as `GET /v1/orgs` serves it in `invites`. */
export interface OrgInviteSummaryWire {
  id: string;
  orgName: string;
  role: OrgRole;
  invitedBy?: string;
}

/** The 16-hex slug behind a team workspace id (`org:<slug>`). */
function slugOf(row: FakeTeamWorkspace): string {
  return row.id.slice("org:".length);
}

/** A team-space row as the org list serves it. */
function orgWire(row: FakeTeamWorkspace): OrgSummaryWire {
  return {
    id: `org-${slugOf(row)}`,
    slug: slugOf(row),
    name: row.name,
    kind: "team",
    role: row.role ?? state.capabilities.role ?? "owner",
    memberCount: row.memberCount ?? 1,
    degraded: row.billing?.status === "locked",
    billing: row.billing ?? null,
  };
}

/** The personal org, listed while the plan is armed (see the header). */
function personalOrgWire(): OrgSummaryWire[] {
  const seed = planSeed();
  if (!seed) return [];
  return [
    {
      id: `org-${PERSONAL_ORG_SLUG}`,
      slug: PERSONAL_ORG_SLUG,
      name: "Personal",
      kind: "personal",
      role: "owner",
      memberCount: 1,
      degraded: false,
      billing: planOrgBilling(seed),
    },
  ];
}

/** Every org the caller belongs to (`GET /v1/orgs` → `orgs`). */
export function listSpaceOrgs(): OrgSummaryWire[] {
  return [...personalOrgWire(), ...state.teamWorkspaces.map(orgWire)];
}

/** The caller's free slot, known only while the plan is armed. */
export function spaceFreeOrg(): FreeOrg | null {
  const seed = planSeed();
  return seed ? planFreeOrg(seed) : null;
}

/**
 * The pending invites `GET /v1/orgs` surfaces. `orgSlug` and the armed
 * `reject` are fixture-only and never reach the wire — the gateway's summary
 * carries exactly these four fields.
 */
export function listSpaceInviteWires(): OrgInviteSummaryWire[] {
  return state.spaceInvites.map((invite) => ({
    id: invite.id,
    orgName: invite.orgName,
    role: invite.role,
    ...(invite.invitedBy !== undefined ? { invitedBy: invite.invitedBy } : {}),
  }));
}

/** The armed invitee-side inbox, verbatim (fixture fields included). */
export function getSpaceInvites(): FakeSpaceInvite[] {
  return state.spaceInvites;
}

/** Replace (or clear, with `[]`) the invitee-side inbox. */
export function setSpaceInvites(invites: FakeSpaceInvite[]): FakeSpaceInvite[] {
  state.spaceInvites = invites;
  return state.spaceInvites;
}

/** The armed invite with this id, or `undefined` (the gateway's 404 case). */
export function findSpaceInvite(id: string): FakeSpaceInvite | undefined {
  return state.spaceInvites.find((invite) => invite.id === id);
}

/** Drop an invite from the inbox, so the next `GET /v1/orgs` no longer has it. */
export function removeSpaceInvite(id: string): void {
  state.spaceInvites = state.spaceInvites.filter((invite) => invite.id !== id);
}

/**
 * Consume an invite: it leaves the inbox and its team becomes a membership —
 * a switcher row (`GET /v1/workspaces`) and an org-list row in one move. The
 * joined summary is what `POST /v1/org-invites/:id/accept` answers.
 *
 * `memberCount` is 2 because somebody had to send the invite; the gateway
 * reports the post-join count and a lone "1" would be a lie the UI could show.
 */
export function acceptSpaceInvite(invite: FakeSpaceInvite): OrgSummaryWire {
  removeSpaceInvite(invite.id);
  const row: FakeTeamWorkspace = {
    id: `org:${invite.orgSlug}`,
    name: invite.orgName,
    role: invite.role,
    memberCount: 2,
  };
  state.teamWorkspaces = [...state.teamWorkspaces, row];
  return orgWire(row);
}

/**
 * A fresh team-space slug: a monotonic counter in hex, so it is deterministic
 * within a test and always matches the id grammar `space-id.ts` enforces (16
 * lowercase hex chars). ONE counter serves both minted teams and the slugs an
 * armed invite would join, so the two can never collide.
 */
export function mintTeamSlug(): string {
  return (++state.teamSeq).toString(16).padStart(16, "0");
}

/**
 * Mint an org with the caller as owner (`POST /v1/orgs`). A free create while
 * the armed slot is taken creates nothing; a paid create is locked until its
 * checkout completes, and answers that checkout beside the org.
 */
export function createTeamSpace(name: string, plan: OrgPlan): CreateOrgOutcome {
  const slot = spaceFreeOrg();
  if (plan === "free" && slot && !slot.available && slot.orgSlug)
    return { kind: "free_org_taken", freeOrgSlug: slot.orgSlug };
  const row: FakeTeamWorkspace = {
    id: `org:${mintTeamSlug()}`,
    name,
    role: "owner",
    memberCount: 1,
    ...(plan === "paid" ? { billing: unpaidOrgBilling() } : {}),
  };
  state.teamWorkspaces = [...state.teamWorkspaces, row];
  const org = orgWire(row);
  return plan === "paid"
    ? { kind: "checkout", org, checkoutUrl: FAKE_CHECKOUT_URL }
    : { kind: "created", org };
}
