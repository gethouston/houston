import type { OrgInfo, OrgRole, OrgsList } from "@houston/wire-types";
import { mapItem, withoutItems } from "./list-patch.ts";

export function orgWithoutMember(
  org: OrgInfo | undefined,
  userId: string,
): OrgInfo | undefined {
  if (!org) return org;
  const members = withoutItems(org.members, (m) => m.userId === userId);
  return members === org.members ? org : { ...org, members };
}

export function orgWithMemberRole(
  org: OrgInfo | undefined,
  userId: string,
  role: OrgRole,
): OrgInfo | undefined {
  if (!org) return org;
  const members = mapItem(
    org.members,
    (m) => m.userId === userId,
    (m) => (m.role === role ? m : { ...m, role }),
  );
  return members === org.members ? org : { ...org, members };
}

export function orgWithoutInvite(
  org: OrgInfo | undefined,
  inviteId: string,
): OrgInfo | undefined {
  if (!org) return org;
  const invites = withoutItems(org.invites, (i) => i.id === inviteId);
  return invites === org.invites ? org : { ...org, invites };
}

export function orgsWithoutInvite(
  list: OrgsList | undefined,
  inviteId: string,
): OrgsList | undefined {
  if (!list) return list;
  const invites = withoutItems(list.invites, (i) => i.id === inviteId);
  return invites === list.invites ? list : { ...list, invites };
}
