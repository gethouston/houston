import type { SeatQuote } from "@houston/wire-types";
import type { ModuleContext } from "../../module-context";
import { moduleScope } from "../http";
import { requireString, requireStrings } from "../payload";
import {
  deleteOrgInvite,
  getOrg,
  getOrgPeople,
  getOrgProfiles,
  OrgHttpError,
  removeOrgMember,
  setOrgMemberRole,
} from "./http";
import { listMemberRoutines, type MemberRoutines } from "./member-routines";
import { type AddOrgMemberOutcome, addOrgMember, quoteSeat } from "./seat-add";
import {
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

export type { ChargeSeatQuote, SeatQuote } from "@houston/wire-types";
export { OrgHttpError } from "./http";
export type {
  MemberRoutine,
  MemberRoutineKind,
  MemberRoutines,
} from "./member-routines";
export {
  type AddOrgMemberOutcome,
  seatAddRefusal,
} from "./seat-add";
export {
  type SeatAddedNote,
  type SeatAddStep,
  type SeatChargeView,
  type SeatNote,
  type SeatRemoveNote,
  seatAddBlocked,
  seatAddedNote,
  seatAddStep,
  seatChargeView,
  seatNote,
  seatRemoveNote,
} from "./seat-view";
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

export interface OrgModule {
  getOrg(): Promise<OrgInfo>;
  getOrgProfiles(ids: string[]): Promise<UserProfilesResult>;
  getOrgPeople(): Promise<OrgPerson[]>;
  quoteSeat(): Promise<SeatQuote>;
  addOrgMember(
    email: string,
    role: OrgRole,
    prorationDate?: number,
    quotedAmountCents?: number,
  ): Promise<AddOrgMemberOutcome>;
  deleteOrgInvite(inviteId: string): Promise<void>;
  removeOrgMember(userId: string): Promise<void>;
  listMemberRoutines(userId: string): Promise<MemberRoutines>;
  setOrgMemberRole(userId: string, role: OrgRole): Promise<void>;
  orgAudit(before?: number, limit?: number): Promise<AuditEntry[]>;
  orgUsage(days: number): Promise<UsageRow[]>;
  computeUsage(days: number): Promise<ComputeUsage>;
}

export function createOrgModule(ctx: ModuleContext): OrgModule {
  const scope = moduleScope(ctx, "org", OrgHttpError);

  ctx.registerCommand(OrgCommand.Get, () => getOrg(scope));
  ctx.registerCommand(OrgCommand.GetProfiles, (p) =>
    getOrgProfiles(scope, requireStrings(p, "ids")),
  );
  ctx.registerCommand(OrgCommand.GetPeople, () => getOrgPeople(scope));
  ctx.registerCommand(OrgCommand.QuoteSeat, () => quoteSeat(scope));
  ctx.registerCommand(OrgCommand.AddMember, (p) =>
    addOrgMember(
      scope,
      requireString(p, "email"),
      requireRole(p, "role"),
      optionalNumber(p, "prorationDate"),
      optionalNumber(p, "quotedAmountCents"),
    ),
  );
  ctx.registerCommand(OrgCommand.DeleteInvite, (p) =>
    deleteOrgInvite(scope, requireString(p, "inviteId")),
  );
  ctx.registerCommand(OrgCommand.RemoveMember, (p) =>
    removeOrgMember(scope, requireString(p, "userId")),
  );
  ctx.registerCommand(OrgCommand.MemberRoutines, (p) =>
    listMemberRoutines(scope, requireString(p, "userId")),
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
    quoteSeat: () => quoteSeat(scope),
    addOrgMember: (email, role, prorationDate, quotedAmountCents) =>
      addOrgMember(scope, email, role, prorationDate, quotedAmountCents),
    deleteOrgInvite: (inviteId) => deleteOrgInvite(scope, inviteId),
    removeOrgMember: (userId) => removeOrgMember(scope, userId),
    listMemberRoutines: (userId) => listMemberRoutines(scope, userId),
    setOrgMemberRole: (userId, role) => setOrgMemberRole(scope, userId, role),
    orgAudit: (before, limit) => orgAudit(scope, before, limit),
    orgUsage: (days) => orgUsage(scope, days),
    computeUsage: (days) => computeUsage(scope, days),
  };
}
