import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

/**
 * Spaces (C8): the list of teams the user belongs to, their invitations, and
 * moving an agent between spaces — the gateway's `/v1/orgs*`,
 * `/v1/org-invites/*` and `/v1/agents/:id/move*` family (`cp/spaces.ts`).
 */
export function SpacesMixin<TBase extends BaseCtor>(Base: TBase) {
  class Spaces extends Base {
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
    // The invitee's own accept/decline (C8). Off-cloud there is no invite to
    // act on, so both throw rather than degrade: a user who clicked Accept must
    // never be told nothing happened.
    async acceptOrgInvite(inviteId: string): Promise<controlPlane.OrgSummary> {
      if (!this.ctx.cp)
        throw new Error("Joining a team needs the hosted gateway.");
      return controlPlane.acceptOrgInvite(this.ctx.cp, inviteId);
    }
    async declineOrgInvite(inviteId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("Declining an invitation needs the hosted gateway.");
      return controlPlane.declineOrgInvite(this.ctx.cp, inviteId);
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
  }
  return Spaces;
}
