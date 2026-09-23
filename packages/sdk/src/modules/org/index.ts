/**
 * The org module — the ACTIVE space's administration: who belongs to it, what
 * each of them may do, and what the space has been used for.
 *
 * These are pure commands: an admin screen opens them, reads once, and writes
 * from a form; no host event invalidates them and no surface renders them
 * continuously, so there is no reactive scope to publish. The same handlers back
 * both the typed facade and the `dispatch` path.
 *
 * SEAM — space-scoped, NOT per-agent. The gateway resolves the space from the
 * caller's session plus the active-space header its `fetch` stamps, so nothing
 * here names an agent and the module talks to the `/v1/org*` family through the
 * SDK's own HTTP seam, never `clientFor(agentId)`. A 401 routes through the
 * shared {@link ModuleContext.authExpiry} notifier, which the HTTP seam signals.
 *
 * Degradations are the CALLER's: every request here throws on a non-2xx, 404
 * included, so a surface that wants "no roster yet" instead of an error says so
 * itself and no surface is handed a silent empty answer it did not ask for.
 */

import type { ModuleContext } from "../../module-context";
import { moduleScope } from "../http";
import { requireString, requireStrings } from "../payload";
import {
  addOrgMember,
  deleteOrgInvite,
  getOrg,
  getOrgPeople,
  getOrgProfiles,
  OrgHttpError,
  removeOrgMember,
  setOrgMemberRole,
} from "./http";
import {
  type AddOrgMemberResult,
  OrgCommand,
  type OrgInfo,
  type OrgPerson,
  type OrgRole,
  optionalNumber,
  requireNumber,
  requireRole,
  type UserProfilesResult,
} from "./types";
import {
  type AuditEntry,
  type ComputeUsage,
  computeUsage,
  orgAudit,
  orgUsage,
  type UsageRow,
} from "./usage";

export { OrgHttpError } from "./http";
export type {
  AddOrgMemberResult,
  OrgInfo,
  OrgInvite,
  OrgMember,
  OrgPerson,
  OrgRole,
  UserProfile,
  UserProfilesResult,
} from "./types";
export { ORG_ROLES, OrgCommand, type OrgCommandType } from "./types";
export type {
  AuditEntry,
  ComputeUsage,
  ComputeUsageRow,
  UsageRow,
} from "./usage";

/** The typed facade for space administration. */
export interface OrgModule {
  /** The active space, with the caller's own role (roster + invites for admins). */
  getOrg(): Promise<OrgInfo>;
  /** Display profiles for the given member ids; an empty list asks nothing. */
  getOrgProfiles(ids: string[]): Promise<UserProfilesResult>;
  /** The sanitized co-member directory of the active space. */
  getOrgPeople(): Promise<OrgPerson[]>;
  /** Add someone by email, or create a pending invite when they are not a user yet. */
  addOrgMember(email: string, role: OrgRole): Promise<AddOrgMemberResult>;
  /** Cancel a pending invitation by id. */
  deleteOrgInvite(inviteId: string): Promise<void>;
  /** Remove a member from the active space by user id. */
  removeOrgMember(userId: string): Promise<void>;
  /** Change what a member may do in the active space. */
  setOrgMemberRole(userId: string, role: OrgRole): Promise<void>;
  /** The audit trail, newest first; both bounds optional. */
  orgAudit(before?: number, limit?: number): Promise<AuditEntry[]>;
  /** Per (agent, user, day) message counts over the last `days` days. */
  orgUsage(days: number): Promise<UsageRow[]>;
  /** Per (agent, day) engine running time over the last `days` days. */
  computeUsage(days: number): Promise<ComputeUsage>;
}

export function createOrgModule(ctx: ModuleContext): OrgModule {
  const scope = moduleScope(ctx, "org", OrgHttpError);

  ctx.registerCommand(OrgCommand.Get, () => getOrg(scope));
  ctx.registerCommand(OrgCommand.GetProfiles, (p) =>
    getOrgProfiles(scope, requireStrings(p, "ids")),
  );
  ctx.registerCommand(OrgCommand.GetPeople, () => getOrgPeople(scope));
  ctx.registerCommand(OrgCommand.AddMember, (p) =>
    addOrgMember(scope, requireString(p, "email"), requireRole(p, "role")),
  );
  ctx.registerCommand(OrgCommand.DeleteInvite, (p) =>
    deleteOrgInvite(scope, requireString(p, "inviteId")),
  );
  ctx.registerCommand(OrgCommand.RemoveMember, (p) =>
    removeOrgMember(scope, requireString(p, "userId")),
  );
  ctx.registerCommand(OrgCommand.SetMemberRole, (p) =>
    setOrgMemberRole(scope, requireString(p, "userId"), requireRole(p, "role")),
  );
  ctx.registerCommand(OrgCommand.Audit, (p) =>
    orgAudit(scope, optionalNumber(p, "before"), optionalNumber(p, "limit")),
  );
  ctx.registerCommand(OrgCommand.Usage, (p) =>
    orgUsage(scope, requireNumber(p, "days")),
  );
  ctx.registerCommand(OrgCommand.ComputeUsage, (p) =>
    computeUsage(scope, requireNumber(p, "days")),
  );

  return {
    getOrg: () => getOrg(scope),
    getOrgProfiles: (ids) => getOrgProfiles(scope, ids),
    getOrgPeople: () => getOrgPeople(scope),
    addOrgMember: (email, role) => addOrgMember(scope, email, role),
    deleteOrgInvite: (inviteId) => deleteOrgInvite(scope, inviteId),
    removeOrgMember: (userId) => removeOrgMember(scope, userId),
    setOrgMemberRole: (userId, role) => setOrgMemberRole(scope, userId, role),
    orgAudit: (before, limit) => orgAudit(scope, before, limit),
    orgUsage: (days) => orgUsage(scope, days),
    computeUsage: (days) => computeUsage(scope, days),
  };
}
