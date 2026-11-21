import type {
  BillingInterval,
  CreateOrgOutcome,
  OrgPlan,
} from "@houston/wire-types";
import type * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

export function SpacesMixin<TBase extends BaseCtor>(Base: TBase) {
  class Spaces extends Base {
    async listOrgs(): Promise<controlPlane.OrgsList> {
      if (!this.ctx.cp) return { orgs: [], invites: [], freeOrg: null };
      try {
        return await viaSdk("/v1/orgs", () => this.ctx.sdk.spaces.listOrgs());
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404) {
          return { orgs: [], invites: [], freeOrg: null };
        }
        throw err;
      }
    }
    async createOrg(input: {
      name: string;
      plan?: OrgPlan;
      interval?: BillingInterval;
    }): Promise<CreateOrgOutcome> {
      if (!this.ctx.cp)
        throw new Error("Creating a team needs the hosted gateway.");
      return viaSdk("/v1/orgs", () => this.ctx.sdk.spaces.createOrg(input));
    }
    async acceptOrgInvite(inviteId: string): Promise<controlPlane.OrgSummary> {
      if (!this.ctx.cp)
        throw new Error("Joining a team needs the hosted gateway.");
      return viaSdk(
        `/v1/org-invites/${encodeURIComponent(inviteId)}/accept`,
        () => this.ctx.sdk.spaces.acceptOrgInvite(inviteId),
      );
    }
    async declineOrgInvite(inviteId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("Declining an invitation needs the hosted gateway.");
      return viaSdk(`/v1/org-invites/${encodeURIComponent(inviteId)}`, () =>
        this.ctx.sdk.spaces.declineOrgInvite(inviteId),
      );
    }
    async moveAgent(
      agentSlugOrId: string,
      toSlug: string,
    ): Promise<controlPlane.AgentMoveStart> {
      if (!this.ctx.cp)
        throw new Error("Moving an agent needs the hosted gateway.");
      return viaSdk(
        `/v1/agents/${encodeURIComponent(agentSlugOrId)}/move`,
        () => this.ctx.sdk.spaces.moveAgent(agentSlugOrId, toSlug),
      );
    }
    async getMoveStatus(
      agentSlugOrId: string,
      moveId: string,
    ): Promise<controlPlane.AgentMoveStatus> {
      if (!this.ctx.cp)
        throw new Error("Moving an agent needs the hosted gateway.");
      return viaSdk(
        `/v1/agents/${encodeURIComponent(agentSlugOrId)}/move/${encodeURIComponent(moveId)}`,
        () => this.ctx.sdk.spaces.getMoveStatus(agentSlugOrId, moveId),
      );
    }
  }
  return Spaces;
}
