import type { Capabilities, OrgRole } from "@houston/engine-adapter";

export function isMultiplayer(caps: Capabilities | null | undefined): boolean {
  return caps?.multiplayer === true;
}

export function hasSpaces(caps: Capabilities | null | undefined): boolean {
  return caps?.spaces === true;
}

export function isPersonalSpace(
  caps: Capabilities | null | undefined,
  activeSpaceIsTeam: boolean,
): boolean {
  return hasSpaces(caps) && !activeSpaceIsTeam;
}

export function orgRole(caps: Capabilities | null | undefined): OrgRole | null {
  if (!isMultiplayer(caps)) return null;
  return caps?.role ?? "user";
}

export function canCreateAgents(
  caps: Capabilities | null | undefined,
): boolean {
  const role = orgRole(caps);
  if (role === null) return true;
  return role === "owner" || role === "admin";
}

export function canSeeMembers(caps: Capabilities | null | undefined): boolean {
  const role = orgRole(caps);
  return role === "owner" || role === "admin";
}

export function canSeeAiModelsPage(
  _caps: Capabilities | null | undefined,
): boolean {
  return true;
}

export function canManageMembers(
  caps: Capabilities | null | undefined,
): boolean {
  return orgRole(caps) === "owner";
}

export function canDeleteWorkspace(
  caps: Capabilities | null | undefined,
): boolean {
  const role = orgRole(caps);
  return role === null || role === "owner";
}

export function isSpaceOwner(
  caps: Capabilities | null | undefined,
  activeSpaceIsTeam: boolean,
): boolean {
  if (!isMultiplayer(caps)) return true;
  if (isPersonalSpace(caps, activeSpaceIsTeam)) return true;
  return orgRole(caps) === "owner";
}

export const GRANTABLE_ROLES: readonly OrgRole[] = [
  "owner",
  "admin",
  "user",
] as const;
