import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

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

    // ---- spaces / teams (C8) — hosted gateway only ----
    // Off-cloud (`this.cp === null`) there is no space concept: `listOrgs` reports
    // an empty result (the switcher shows only the personal workspace), while the
    // mutating calls throw — a create/move must reach the gateway.
    async listOrgs(): Promise<controlPlane.OrgsList> {
      if (!this.ctx.cp) return { orgs: [], invites: [] };
      return controlPlane.listOrgs(this.ctx.cp);
    }
    async createOrg(name: string): Promise<controlPlane.OrgSummary> {
      if (!this.ctx.cp)
        throw new Error("Creating a team needs the hosted gateway.");
      return controlPlane.createOrg(this.ctx.cp, name);
    }
    async moveAgent(
      agentSlugOrId: string,
      toSlug: string,
    ): Promise<controlPlane.AgentMoveStart> {
      if (!this.ctx.cp)
        throw new Error("Moving an agent needs the hosted gateway.");
      return controlPlane.moveAgent(this.ctx.cp, agentSlugOrId, toSlug);
    }
    async getMoveStatus(
      agentSlugOrId: string,
      moveId: string,
    ): Promise<controlPlane.AgentMoveStatus> {
      if (!this.ctx.cp)
        throw new Error("Moving an agent needs the hosted gateway.");
      return controlPlane.getMoveStatus(this.ctx.cp, agentSlugOrId, moveId);
    }

    // ---- billing (C8) — hosted gateway only ----
    // Off-cloud (`this.cp === null`) there is no team/billing concept: the read
    // degrades to null (the billing UI renders nothing), while checkout/portal
    // throw — a write must reach the gateway.
    async getBilling(): Promise<controlPlane.BillingSummary | null> {
      if (!this.ctx.cp) return null;
      return controlPlane.getBilling(this.ctx.cp);
    }
    async createCheckout(
      interval: "monthly" | "annual",
    ): Promise<controlPlane.BillingCheckout> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return controlPlane.createCheckout(this.ctx.cp, interval);
    }
    async createPortal(): Promise<controlPlane.BillingCheckout> {
      if (!this.ctx.cp) throw new Error("Billing needs the hosted gateway.");
      return controlPlane.createPortal(this.ctx.cp);
    }
  }
  return Orgs;
}
