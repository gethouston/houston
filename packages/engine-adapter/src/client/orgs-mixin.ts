import type { AddOrgMemberOutcome, SeatQuote } from "@houston/sdk";
import type * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function OrgsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Orgs extends Base {
    async getOrg(): Promise<controlPlane.OrgInfo> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk("/v1/org", () => this.ctx.sdk.org.getOrg());
    }
    async getOrgProfiles(
      ids: string[],
    ): Promise<controlPlane.UserProfilesResult> {
      if (!this.ctx.cp) return { profiles: {} };
      try {
        return await viaSdk("/v1/org/profiles", () =>
          this.ctx.sdk.org.getOrgProfiles(ids),
        );
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404) {
          return { profiles: {} };
        }
        throw err;
      }
    }
    async getOrgPeople(): Promise<controlPlane.OrgPerson[]> {
      if (!this.ctx.cp) return [];
      try {
        return await viaSdk("/v1/org/people", () =>
          this.ctx.sdk.org.getOrgPeople(),
        );
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404) return [];
        throw err;
      }
    }
    async quoteSeat(): Promise<SeatQuote> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      try {
        return await viaSdk("/v1/org/members/quote", () =>
          this.ctx.sdk.org.quoteSeat(),
        );
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404) {
          return { kind: "no_charge" };
        }
        throw err;
      }
    }
    async addOrgMember(
      email: string,
      role: controlPlane.OrgRole,
      prorationDate?: number,
      quotedAmountCents?: number,
    ): Promise<AddOrgMemberOutcome> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk("/v1/org/members", () =>
        this.ctx.sdk.org.addOrgMember(
          email,
          role,
          prorationDate,
          quotedAmountCents,
        ),
      );
    }
    async deleteOrgInvite(inviteId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk(`/v1/org/invites/${encodeURIComponent(inviteId)}`, () =>
        this.ctx.sdk.org.deleteOrgInvite(inviteId),
      );
    }
    async removeOrgMember(userId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk(`/v1/org/members/${encodeURIComponent(userId)}`, () =>
        this.ctx.sdk.org.removeOrgMember(userId),
      );
    }
    async listMemberRoutines(
      userId: string,
    ): Promise<controlPlane.MemberRoutines> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk(
        `/v1/org/members/${encodeURIComponent(userId)}/routines`,
        () => this.ctx.sdk.org.listMemberRoutines(userId),
      );
    }
    async setOrgMemberRole(
      userId: string,
      role: controlPlane.OrgRole,
    ): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk(`/v1/org/members/${encodeURIComponent(userId)}`, () =>
        this.ctx.sdk.org.setOrgMemberRole(userId, role),
      );
    }

    async orgAudit(
      opts: { before?: number; limit?: number } = {},
    ): Promise<controlPlane.AuditEntry[]> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk("/v1/org/audit", () =>
        this.ctx.sdk.org.orgAudit(opts.before, opts.limit),
      );
    }
    async orgUsage(days: number): Promise<controlPlane.UsageRow[]> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return viaSdk("/v1/org/usage", () => this.ctx.sdk.org.orgUsage(days));
    }
    async computeUsage(days: number): Promise<controlPlane.ComputeUsage> {
      if (!this.ctx.cp)
        throw new Error("compute usage requires the hosted gateway");
      return viaSdk("/v1/org/compute-usage", () =>
        this.ctx.sdk.org.computeUsage(days),
      );
    }
  }
  return Orgs;
}
