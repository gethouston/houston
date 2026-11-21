import type { OrgInviteSummary } from "@houston/engine-adapter";
import { shareErrorCode } from "./share-error.ts";
import { orgSlugFromWorkspaceId } from "./space-id.ts";

export type InviteFailure =
  | "needs_upgrade"
  | "already_member"
  | "invite_not_found"
  | "unknown";

const EXPECTED_INVITE_CODES = new Set<InviteFailure>([
  "needs_upgrade",
  "already_member",
  "invite_not_found",
]);

export function classifyInviteError(err: unknown): InviteFailure {
  const code = shareErrorCode(err);
  return code !== undefined && EXPECTED_INVITE_CODES.has(code as InviteFailure)
    ? (code as InviteFailure)
    : "unknown";
}

export function isExpectedInviteError(err: unknown): boolean {
  return classifyInviteError(err) !== "unknown";
}

export function inviterDisplayName(
  invitedBy: string | undefined,
): string | null {
  const value = invitedBy?.trim();
  if (!value) return null;
  if (value.includes("@")) return value;
  return /\s/.test(value) ? value : null;
}

export function sortInvites(
  invites: readonly OrgInviteSummary[],
): OrgInviteSummary[] {
  return [...invites].sort(
    (a, b) => a.orgName.localeCompare(b.orgName) || a.id.localeCompare(b.id),
  );
}

export function visibleInvites(
  spacesEnabled: boolean,
  invites: readonly OrgInviteSummary[],
): OrgInviteSummary[] {
  return spacesEnabled ? sortInvites(invites) : [];
}

export function teamIsInSwitcher(
  workspaces: readonly { id: string }[],
  slug: string,
): boolean {
  return workspaces.some((w) => orgSlugFromWorkspaceId(w.id) === slug);
}

export interface InviteActionLock {
  claim(inviteId: string): boolean;
  release(inviteId: string): void;
}

export function createInviteActionLock(): InviteActionLock {
  const inFlight = new Set<string>();
  return {
    claim(inviteId) {
      if (inFlight.has(inviteId)) return false;
      inFlight.add(inviteId);
      return true;
    },
    release(inviteId) {
      inFlight.delete(inviteId);
    },
  };
}
