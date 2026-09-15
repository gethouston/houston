/**
 * Wire types for the ACTIVE space's administration — who belongs to it, what
 * each of them may do, and the pending invitations — plus the command
 * vocabulary the bridge dispatches them by.
 *
 * Every shape here is space-scoped, never per-agent: the gateway resolves the
 * space from the caller's session plus the active-space header, so nothing in
 * this module names one. The account-activity shapes (audit, usage) live beside
 * the three calls that read them, in `usage.ts`.
 */

import type { OrgRole } from "@houston/protocol";

export type { OrgRole };

/** The write vocabulary — the same constants back the facade and the bridge. */
export const OrgCommand = {
  Get: "org/get",
  GetProfiles: "org/getProfiles",
  GetPeople: "org/getPeople",
  AddMember: "org/addMember",
  DeleteInvite: "org/deleteInvite",
  RemoveMember: "org/removeMember",
  SetMemberRole: "org/setMemberRole",
  Audit: "org/audit",
  Usage: "org/usage",
  ComputeUsage: "org/computeUsage",
} as const;

export type OrgCommandType = (typeof OrgCommand)[keyof typeof OrgCommand];

/**
 * The runtime mirror of the protocol's {@link OrgRole} union — a bridge payload
 * arrives untyped, and a union is not a value to check it against. A role added
 * to the protocol must be added here too, or this module refuses it.
 */
export const ORG_ROLES: readonly OrgRole[] = ["owner", "admin", "user"];

/** One member of the caller's active space. */
export interface OrgMember {
  userId: string;
  /** The member's email, when the host exposes it to the caller. */
  email?: string;
  role: OrgRole;
  /** The member's GCIP display name, when the gateway has one stored. */
  displayName?: string;
  /** The member's GCIP profile photo URL, when the gateway has one stored. */
  photoUrl?: string;
}

/**
 * A pending invite to the space, surfaced to owner/admin on `GET /v1/org`.
 * `email` is the invited address; the invite is consumed on that user's first
 * sign-in. `createdAt` is epoch milliseconds.
 */
export interface OrgInvite {
  id: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
  createdAt: number;
}

/**
 * The caller's active space, with the caller's own role. `members` is populated
 * only for callers allowed to see the roster (owner/admin); a plain `user` gets
 * just the identity fields. `invites` (pending, un-consumed) is likewise
 * owner/admin only.
 */
export interface OrgInfo {
  id: string;
  slug: string;
  name: string;
  role: OrgRole;
  members?: OrgMember[];
  /** Pending invites, for owner/admin callers only. */
  invites?: OrgInvite[];
}

/**
 * The public display fields of one human user. Both are optional — a user who
 * never set a name or photo resolves to a bare `{}`, so a consumer falls back
 * to initials / a short id rather than render an empty face. Sourced from the
 * gateway's stored GCIP `name`/`picture`.
 */
export interface UserProfile {
  displayName?: string;
  photoUrl?: string;
}

/**
 * Response of `GET /v1/org/profiles?ids=<csv>`: display profiles for the
 * requested member ids, keyed by user id. Ids that are NOT co-members of the
 * caller's active space are omitted (the personal space resolves only the
 * caller).
 */
export interface UserProfilesResult {
  profiles: Record<string, UserProfile>;
}

/**
 * One entry of the sanitized co-member directory: no email, no role.
 * `displayName`/`photoUrl` come from the gateway's stored GCIP profile and are
 * both optional.
 */
export interface OrgPerson {
  userId: string;
  displayName?: string;
  photoUrl?: string;
}

/**
 * Result of `POST /v1/org/members`. A known Houston user is added directly
 * (`userId` set); an unknown email creates a pending invite instead and the
 * host answers `202` with `invited: true`. `role` echoes the requested role in
 * both cases.
 */
export interface AddOrgMemberResult {
  /** Set when an existing user was added directly (not invited). */
  userId?: string;
  role: OrgRole;
  /** True when an invite was created because the email is not yet a user. */
  invited?: boolean;
  /** The invited email, echoed on the invite path. */
  email?: string;
}

/** The raw value of `key` off an untrusted command payload. */
function field(payload: unknown, key: string): unknown {
  return typeof payload === "object" && payload !== null
    ? (payload as Record<string, unknown>)[key]
    : undefined;
}

/** A required non-empty string off an untrusted command payload. */
export function requireString(payload: unknown, key: string): string {
  const value = field(payload, key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing '${key}'`);
  }
  return value;
}

/** A required array of non-empty strings off an untrusted command payload. */
export function requireStrings(payload: unknown, key: string): string[] {
  const value = field(payload, key);
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new Error(`'${key}' must be an array of ids`);
  }
  return value as string[];
}

/** A required finite number off an untrusted command payload. */
export function requireNumber(payload: unknown, key: string): number {
  const value = field(payload, key);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`missing '${key}'`);
  }
  return value;
}

/**
 * An optional finite number off an untrusted command payload. `undefined` is
 * what the request omits, so an absent key must not become a `0` the gateway
 * would read as a real bound.
 */
export function optionalNumber(
  payload: unknown,
  key: string,
): number | undefined {
  const value = field(payload, key);
  if (value === null || value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`'${key}' must be a number`);
  }
  return value;
}

/** A role off an untrusted command payload, refused unless it is one we know. */
export function requireRole(payload: unknown, key: string): OrgRole {
  const value = requireString(payload, key);
  const role = ORG_ROLES.find((known) => known === value);
  if (!role) {
    throw new Error(`'${key}' must be one of ${ORG_ROLES.join(", ")}`);
  }
  return role;
}
