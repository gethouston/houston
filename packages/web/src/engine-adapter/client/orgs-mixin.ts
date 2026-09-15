import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

/**
 * Org administration: who is in the active space, what role they hold, and the
 * account-level activity/usage reads the admin screens render. Every method
 * here reaches `cp/orgs.ts` — the gateway's `/v1/org*` family — which is why
 * the audit/usage trio lives beside the roster rather than with the per-agent
 * settings in {@link TeamsMixin}.
 */
export function OrgsMixin<TBase extends BaseCtor>(Base: TBase) {
  class Orgs extends Base {
    // ---- org / roles (multiplayer) — hosted gateway only ----
    async getOrg(): Promise<controlPlane.OrgInfo> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.getOrg(this.ctx.cp);
    }
    // Teammate display profiles (name + photo) for a set of member ids. Off-cloud
    // (`this.cp === null`) there is no roster to resolve, so this degrades to an
    // empty map (faces fall back to initials) rather than throwing — a cosmetic
    // read, unlike the org mutators above. Mirrors `getBilling`/`listOrgs`.
    async getOrgProfiles(
      ids: string[],
    ): Promise<controlPlane.UserProfilesResult> {
      if (!this.ctx.cp) return { profiles: {} };
      return controlPlane.getOrgProfiles(this.ctx.cp, ids);
    }
    // The active space's co-member directory, backing the composer's @mention
    // autocomplete (HOU-944). Off-cloud (`this.cp === null`) there is nobody to
    // mention, so this degrades to an empty list — `@` types plainly and no
    // popover ever opens — rather than throwing, exactly like `getOrgProfiles`.
    async getOrgPeople(): Promise<controlPlane.OrgPerson[]> {
      if (!this.ctx.cp) return [];
      return controlPlane.getOrgPeople(this.ctx.cp);
    }
    async addOrgMember(
      email: string,
      role: controlPlane.OrgRole,
    ): Promise<controlPlane.AddOrgMemberResult> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.addOrgMember(this.ctx.cp, email, role);
    }
    async deleteOrgInvite(inviteId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.deleteOrgInvite(this.ctx.cp, inviteId);
    }
    async removeOrgMember(userId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.removeOrgMember(this.ctx.cp, userId);
    }
    async setOrgMemberRole(
      userId: string,
      role: controlPlane.OrgRole,
    ): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.setOrgMemberRole(this.ctx.cp, userId, role);
    }

    // ---- account activity + usage — hosted gateway only ----
    async orgAudit(
      opts: { before?: number; limit?: number } = {},
    ): Promise<controlPlane.AuditEntry[]> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.orgAudit(this.ctx.cp, opts);
    }
    async orgUsage(days: number): Promise<controlPlane.UsageRow[]> {
      if (!this.ctx.cp)
        throw new Error("multiplayer requires the hosted gateway");
      return controlPlane.orgUsage(this.ctx.cp, days);
    }
    // Tripwire only: the UI gates the compute section (and its query) on
    // `capabilities.computeUsage`, which no gateway-less deployment advertises.
    async computeUsage(days: number): Promise<controlPlane.ComputeUsage> {
      if (!this.ctx.cp)
        throw new Error("compute usage requires the hosted gateway");
      return controlPlane.computeUsage(this.ctx.cp, days);
    }
  }
  return Orgs;
}
