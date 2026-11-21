import type {
  ComputeUsageSeed,
  FakeCapabilities,
  FakeInvite,
  FakeMember,
  FakeTeamWorkspace,
  OrgRole,
  TeamsSettings,
} from "./state-store";
import { SELF_USER_ID, state } from "./state-store";

export function getCapabilities(): FakeCapabilities {
  return state.capabilities;
}

export function setCapabilities(
  patch: Partial<FakeCapabilities>,
): FakeCapabilities {
  state.capabilities = { ...state.capabilities, ...patch };
  return state.capabilities;
}

export function getTeamsSettings(): TeamsSettings {
  return state.teamsSettings;
}

export function setTeamsSettings(patch: Partial<TeamsSettings>): TeamsSettings {
  state.teamsSettings = { ...state.teamsSettings, ...patch };
  return state.teamsSettings;
}

export function getOrgMembers(): FakeMember[] | null {
  return state.orgMembers;
}

export function setOrgMembers(
  members: FakeMember[] | null,
): FakeMember[] | null {
  state.orgMembers = members;
  const self = members?.find((m) => m.userId === SELF_USER_ID);
  state.meProfileBase = {
    ...(self?.displayName !== undefined
      ? { displayName: self.displayName }
      : {}),
    ...(self?.photoUrl !== undefined ? { photoUrl: self.photoUrl } : {}),
  };
  return state.orgMembers;
}

export function getOrgInvites(): FakeInvite[] {
  return state.orgInvites;
}

export function setOrgInvites(invites: FakeInvite[]): FakeInvite[] {
  state.orgInvites = invites;
  return state.orgInvites;
}

export function addOrgInvite(email: string, role: OrgRole): FakeInvite {
  const invite: FakeInvite = {
    id: `invite-${++state.inviteSeq}`,
    email,
    role,
    invitedBy: SELF_USER_ID,
    createdAt: Date.now(),
  };
  state.orgInvites = [...state.orgInvites, invite];
  return invite;
}

export function getTeamWorkspaces(): FakeTeamWorkspace[] {
  return state.teamWorkspaces;
}

export function setTeamWorkspaces(
  rows: FakeTeamWorkspace[],
): FakeTeamWorkspace[] {
  state.teamWorkspaces = rows;
  return state.teamWorkspaces;
}

export function isKnownWorkspace(id: string, seedId: string): boolean {
  return id === seedId || state.teamWorkspaces.some((w) => w.id === id);
}

export function getComputeUsage(): ComputeUsageSeed | null {
  return state.computeUsage;
}

export function setComputeUsage(
  seed: ComputeUsageSeed | null,
): ComputeUsageSeed | null {
  state.computeUsage = seed;
  return state.computeUsage;
}
