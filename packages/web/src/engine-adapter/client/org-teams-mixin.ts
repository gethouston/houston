import * as controlPlane from "../control-plane";
import type { BaseCtor } from "./mixin";

/**
 * C13 agent teams — the hosted gateway only. Distinct from {@link TeamsMixin},
 * which carries the per-AGENT multiplayer surface (assignments, settings, model
 * choice) and shares only a name.
 *
 * NOTHING here degrades to `[]`/`null` off-cloud, reads included: the whole
 * surface is gated on `capabilities.agentTeams`, which no gateway-less
 * deployment advertises, so reaching these methods without a control plane is a
 * caller bug and must say so. A silently-empty answer would render "you have no
 * teams" as the truth and blank the rail.
 */
export function OrgTeamsMixin<TBase extends BaseCtor>(Base: TBase) {
  class OrgTeams extends Base {
    async listAgentTeams(): Promise<controlPlane.AgentTeam[]> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return controlPlane.listAgentTeams(this.ctx.cp);
    }
    async createAgentTeam(name: string): Promise<controlPlane.AgentTeam> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return controlPlane.createAgentTeam(this.ctx.cp, name);
    }
    async updateAgentTeam(
      teamId: string,
      patch: { name?: string; sortOrder?: number },
    ): Promise<controlPlane.AgentTeam> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return controlPlane.updateAgentTeam(this.ctx.cp, teamId, patch);
    }
    async deleteAgentTeam(teamId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return controlPlane.deleteAgentTeam(this.ctx.cp, teamId);
    }
    async listAgentTeamMembers(
      teamId: string,
    ): Promise<controlPlane.AgentTeamMember[]> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return controlPlane.listAgentTeamMembers(this.ctx.cp, teamId);
    }
    async joinAgentTeam(teamId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return controlPlane.joinAgentTeam(this.ctx.cp, teamId);
    }
    async removeAgentTeamMember(teamId: string, userId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return controlPlane.removeAgentTeamMember(this.ctx.cp, teamId, userId);
    }
    async setAgentTeamMemberOwner(
      teamId: string,
      userId: string,
      owner: boolean,
    ): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return controlPlane.setAgentTeamMemberOwner(
        this.ctx.cp,
        teamId,
        userId,
        owner,
      );
    }
    async setAgentTeam(agentSlugOrId: string, teamId: string): Promise<void> {
      if (!this.ctx.cp)
        throw new Error("agent teams require the hosted gateway");
      return controlPlane.setAgentTeam(this.ctx.cp, agentSlugOrId, teamId);
    }
  }
  return OrgTeams;
}
