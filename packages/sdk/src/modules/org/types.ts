import type { OrgRole } from "@houston/protocol";
import { field, requireString } from "../payload";

export type { OrgRole };

export const OrgCommand = {
  Get: "org/get",
  GetProfiles: "org/getProfiles",
  GetPeople: "org/getPeople",
  AddMember: "org/addMember",
  QuoteSeat: "org/quoteSeat",
  DeleteInvite: "org/deleteInvite",
  RemoveMember: "org/removeMember",
  MemberRoutines: "org/memberRoutines",
  SetMemberRole: "org/setMemberRole",
  Audit: "org/audit",
  Usage: "org/usage",
  ComputeUsage: "org/computeUsage",
} as const;

export type OrgCommandType = (typeof OrgCommand)[keyof typeof OrgCommand];

export const ORG_ROLES: readonly OrgRole[] = ["owner", "admin", "user"];

export interface OrgMember {
  userId: string;
  email?: string;
  role: OrgRole;
  displayName?: string;
  photoUrl?: string;
}

export interface OrgInvite {
  id: string;
  email: string;
  role: OrgRole;
  invitedBy: string;
  createdAt: number;
}

export interface OrgInfo {
  id: string;
  slug: string;
  name: string;
  role: OrgRole;
  members?: OrgMember[];
  invites?: OrgInvite[];
}

export interface UserProfile {
  displayName?: string;
  photoUrl?: string;
}

export interface UserProfilesResult {
  profiles: Record<string, UserProfile>;
}

export interface OrgPerson {
  userId: string;
  displayName?: string;
  photoUrl?: string;
}

export interface AddOrgMemberResult {
  userId?: string;
  role: OrgRole;
  invited?: boolean;
  email?: string;
}

export function requireNumber(payload: unknown, key: string): number {
  const value = field(payload, key);
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`missing '${key}'`);
  }
  return value;
}

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

export function requireRole(payload: unknown, key: string): OrgRole {
  const value = requireString(payload, key);
  const role = ORG_ROLES.find((known) => known === value);
  if (!role) {
    throw new Error(`'${key}' must be one of ${ORG_ROLES.join(", ")}`);
  }
  return role;
}
