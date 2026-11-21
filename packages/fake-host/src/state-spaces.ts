import type {
  CreateOrgOutcome,
  FreeOrg,
  OrgPlan,
  OrgSummary,
} from "@houston/wire-types";
import {
  freeOrgBilling,
  PERSONAL_ORG_SLUG,
  planFreeOrg,
  planOrgBilling,
  servedBilling,
  unpaidOrgBilling,
} from "./state-org-billing";
import { FAKE_CHECKOUT_URL, planSeed } from "./state-plan";
import type {
  FakeSpaceInvite,
  FakeTeamWorkspace,
  OrgRole,
} from "./state-store";
import { state } from "./state-store";

export type OrgSummaryWire = OrgSummary;

export interface OrgInviteSummaryWire {
  id: string;
  orgName: string;
  role: OrgRole;
  invitedBy?: string;
}

function slugOf(row: FakeTeamWorkspace): string {
  return row.id.slice("org:".length);
}

function orgWire(row: FakeTeamWorkspace): OrgSummaryWire {
  return {
    id: `org-${slugOf(row)}`,
    slug: slugOf(row),
    name: row.name,
    kind: "team",
    role: row.role ?? state.capabilities.role ?? "owner",
    memberCount: row.memberCount ?? 1,
    degraded: row.billing?.status === "locked",
    billing: servedBilling(row.billing ?? null),
  };
}

function personalOrgWire(): OrgSummaryWire[] {
  const seed = planSeed();
  if (!seed) return [];
  const billing = servedBilling(planOrgBilling(seed));
  return [
    {
      id: `org-${PERSONAL_ORG_SLUG}`,
      slug: PERSONAL_ORG_SLUG,
      name: "Personal",
      kind: "personal",
      role: "owner",
      memberCount: 1,
      degraded: billing.status === "locked",
      billing,
    },
  ];
}

export function listSpaceOrgs(): OrgSummaryWire[] {
  return [...personalOrgWire(), ...state.teamWorkspaces.map(orgWire)];
}

export function spaceFreeOrg(): FreeOrg | null {
  const seed = planSeed();
  return seed ? planFreeOrg(seed) : null;
}

export function listSpaceInviteWires(): OrgInviteSummaryWire[] {
  return state.spaceInvites.map((invite) => ({
    id: invite.id,
    orgName: invite.orgName,
    role: invite.role,
    ...(invite.invitedBy !== undefined ? { invitedBy: invite.invitedBy } : {}),
  }));
}

export function getSpaceInvites(): FakeSpaceInvite[] {
  return state.spaceInvites;
}

export function setSpaceInvites(invites: FakeSpaceInvite[]): FakeSpaceInvite[] {
  state.spaceInvites = invites;
  return state.spaceInvites;
}

export function findSpaceInvite(id: string): FakeSpaceInvite | undefined {
  return state.spaceInvites.find((invite) => invite.id === id);
}

export function removeSpaceInvite(id: string): void {
  state.spaceInvites = state.spaceInvites.filter((invite) => invite.id !== id);
}

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

export function mintTeamSlug(): string {
  return (++state.teamSeq).toString(16).padStart(16, "0");
}

export function createTeamSpace(name: string, plan: OrgPlan): CreateOrgOutcome {
  const seed = planSeed();
  const slot = seed ? planFreeOrg(seed) : null;
  if (plan === "free" && slot && !slot.available && slot.orgSlug)
    return { kind: "free_org_taken", freeOrgSlug: slot.orgSlug };
  const slug = mintTeamSlug();
  const billing =
    plan === "paid" ? unpaidOrgBilling() : slot ? freeOrgBilling() : null;
  const row: FakeTeamWorkspace = {
    id: `org:${slug}`,
    name,
    role: "owner",
    memberCount: 1,
    ...(billing ? { billing } : {}),
  };
  state.teamWorkspaces = [...state.teamWorkspaces, row];
  if (seed && plan === "free")
    seed.freeOrg = { available: false, orgSlug: slug };
  const org = orgWire(row);
  return plan === "paid"
    ? { kind: "checkout", org, checkoutUrl: FAKE_CHECKOUT_URL }
    : { kind: "created", org };
}
