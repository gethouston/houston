/**
 * C8 Spaces state — the CROSS-org surface `GET /v1/orgs` serves: every team the
 * caller belongs to, plus every pending invite addressed to them (the
 * invitee-side inbox the sidebar renders under the workspace switcher).
 *
 * Memberships have ONE source of truth here: the armed team-space rows
 * (`state.teamWorkspaces` — the same rows `GET /v1/workspaces` bridges). So
 * accepting an invite appends a row and the team appears in the switcher AND in
 * the org list at once, exactly as it does behind the real gateway, with no
 * second fixture to keep in sync.
 *
 * No PERSONAL `OrgSummary` is synthesized. The gateway lists one, but the fake
 * host's personal space is the seed WORKSPACE (`SEED_WORKSPACE_ID`), not an org
 * record with a slug — inventing one would put an id in `/v1/orgs` that
 * `/v1/workspaces` contradicts. Every client surface reading this list filters
 * to `kind:"team"` (the team picker) or matches the ACTIVE team's slug (the
 * degraded banner), so the omission is unobservable.
 *
 * The `FakeSpaceInvite` / `SpaceInviteRejection` shapes live in
 * `state-store.ts` with the rest of the wire fixtures; this module is their
 * read/write surface, mirroring `state-teams.ts`.
 */

import type {
  FakeSpaceInvite,
  FakeTeamWorkspace,
  OrgRole,
} from "./state-store";
import { state } from "./state-store";

/**
 * One membership as `GET /v1/orgs` serves it. Mirrors the engine-client
 * `OrgSummary` wire shape structurally (that type lives in
 * `@houston-ai/engine-client`, which this package does not depend on) minus the
 * optional billing detail, which C8 omits from summaries.
 */
export interface OrgSummaryWire {
  id: string;
  slug: string;
  name: string;
  kind: "personal" | "team";
  role: OrgRole;
  memberCount: number;
  degraded: boolean;
}

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
    degraded: false,
  };
}

/** Every team the caller belongs to (`GET /v1/orgs` → `orgs`). */
export function listSpaceOrgs(): OrgSummaryWire[] {
  return state.teamWorkspaces.map(orgWire);
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

/** Mint a team with the caller as owner (`POST /v1/orgs`). */
export function createTeamSpace(name: string): OrgSummaryWire {
  const row: FakeTeamWorkspace = {
    id: `org:${mintTeamSlug()}`,
    name,
    role: "owner",
    memberCount: 1,
  };
  state.teamWorkspaces = [...state.teamWorkspaces, row];
  return orgWire(row);
}
