import type * as controlPlane from "../control-plane";
import { HoustonEngineError } from "./errors";
import type { BaseCtor } from "./mixin";
import { viaSdk } from "./sdk-error";

/**
 * Spaces (C8): the list of teams the user belongs to, their invitations, and
 * moving an agent between spaces — the gateway's `/v1/orgs*`,
 * `/v1/org-invites/*` and `/v1/agents/:id/move*` family, delegated whole to
 * `sdk.spaces` (`packages/sdk/src/modules/spaces`).
 *
 * The SDK never softens a failure, so the ONE degradation this family has lives
 * here: a gateway that predates spaces answers `GET /v1/orgs` with a 404, and
 * the switcher must show the personal workspace rather than an error.
 */
export function SpacesMixin<TBase extends BaseCtor>(Base: TBase) {
  class Spaces extends Base {
    // ---- spaces / teams (C8) — hosted gateway only ----
    // Off-cloud (`this.cp === null`) there is no space concept: `listOrgs` reports
    // an empty result (the switcher shows only the personal workspace), while the
    // mutating calls throw — a create/move must reach the gateway.
    async listOrgs(): Promise<controlPlane.OrgsList> {
      if (!this.ctx.cp) return { orgs: [], invites: [] };
      try {
        return await viaSdk("/v1/orgs", () => this.ctx.sdk.spaces.listOrgs());
      } catch (err) {
        if (err instanceof HoustonEngineError && err.status === 404) {
          return { orgs: [], invites: [] };
        }
        throw err;
      }
    }
    async createOrg(name: string): Promise<controlPlane.OrgSummary> {
      if (!this.ctx.cp)
        throw new Error("Creating a team needs the hosted gateway.");
      return viaSdk("/v1/orgs", () => this.ctx.sdk.spaces.createOrg(name));
    }
    // The invitee's own accept/decline (C8). Off-cloud there is no invite to
    // act on, so both throw rather than degrade: a user who clicked Accept must
    // never be told nothing happened.
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
