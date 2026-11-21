const TEAM_WORKSPACE_ID = /^org:([a-f0-9]{16})$/;

export function orgSlugFromWorkspaceId(id: string): string | null {
  const match = TEAM_WORKSPACE_ID.exec(id);
  return match ? match[1] : null;
}

export function isTeamWorkspace(id: string): boolean {
  return orgSlugFromWorkspaceId(id) !== null;
}

export const PERSONAL_WORKSPACE_ID = "default";

export function eventTargetsOpenWorkspace(
  eventWorkspaceId: string | undefined,
  openWorkspaceId: string | undefined,
): boolean {
  if (!openWorkspaceId) return false;
  if (!eventWorkspaceId) return true;
  if (eventWorkspaceId === openWorkspaceId) return true;
  if (openWorkspaceId !== PERSONAL_WORKSPACE_ID) return false;
  return !isTeamWorkspace(eventWorkspaceId);
}
